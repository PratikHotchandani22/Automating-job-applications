// app/api/generate-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";

const LATEX_API_URL = "https://latex.ytotech.com/builds/sync";

interface GeneratePDFRequest {
  latex: string;
  filename?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GeneratePDFRequest = await request.json();
    const { latex, filename = "resume" } = body;

    if (!latex || typeof latex !== "string") {
      return NextResponse.json(
        { error: "LaTeX content is required" },
        { status: 400 }
      );
    }

    // Use YtoTech LaTeX API (free, no registration required)
    // Docs: https://github.com/YtoTech/latex-on-http
    const response = await fetch(LATEX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        compiler: "pdflatex",
        resources: [
          {
            main: true,
            content: latex,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("LaTeX API error:", errorText);
      
      // Try to parse compilation errors
      let errorMessage = "Failed to generate PDF";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.logs) {
          errorMessage = `LaTeX compilation error: ${errorData.logs.substring(0, 500)}...`;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        errorMessage = `LaTeX API error: ${response.status} ${response.statusText}`;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    // Get the PDF content
    const pdfBuffer = await response.arrayBuffer();

    // Return the PDF with proper headers
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        "Content-Length": pdfBuffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support returning PDF as base64 for storage
export async function PUT(request: NextRequest) {
  try {
    const body: GeneratePDFRequest = await request.json();
    const { latex, filename = "resume" } = body;

    if (!latex || typeof latex !== "string") {
      return NextResponse.json(
        { error: "LaTeX content is required" },
        { status: 400 }
      );
    }

    // Use YtoTech LaTeX API
    const response = await fetch(LATEX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        compiler: "pdflatex",
        resources: [
          {
            main: true,
            content: latex,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("LaTeX API error:", errorText);
      
      let errorMessage = "Failed to generate PDF";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.logs) {
          errorMessage = `LaTeX compilation error: ${errorData.logs.substring(0, 500)}...`;
        }
      } catch {
        errorMessage = `LaTeX API error: ${response.status}`;
      }
      
      return NextResponse.json(
        { error: errorMessage, success: false },
        { status: 500 }
      );
    }

    // Get the PDF content as base64
    const pdfBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(pdfBuffer).toString("base64");

    return NextResponse.json({
      success: true,
      pdf: base64,
      filename: `${filename}.pdf`,
      size: pdfBuffer.byteLength,
      mimeType: "application/pdf",
    });
  } catch (error: any) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error", success: false },
      { status: 500 }
    );
  }
}

