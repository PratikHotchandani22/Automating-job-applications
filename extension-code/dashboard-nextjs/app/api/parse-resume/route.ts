import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export async function POST(request: NextRequest) {
  // Check authentication for this API route
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const fileType = file.type;
    const fileName = file.name;
    let extractedText: string;

    // Parse based on file type
    if (
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      // Parse Word document
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      // Parse PDF
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const data = await pdfParse(buffer);
      extractedText = data.text;
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a .docx or .pdf file." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      text: extractedText,
      fileName: fileName,
    });
  } catch (error: any) {
    console.error("Error parsing resume file:", error);
    return NextResponse.json(
      { error: "Failed to parse file: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}

