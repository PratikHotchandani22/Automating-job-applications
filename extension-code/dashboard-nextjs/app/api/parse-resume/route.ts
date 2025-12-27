import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const URL_REGEX = /((https?:\/\/|www\.)[^\s<>()\[\]{}"']+)/gi;
const TRAILING_PUNCT_REGEX = /[)\].,;:!?]+$/;

function normalizeUrl(raw: string): string {
  const trimmed = raw.replace(TRAILING_PUNCT_REGEX, "");
  if (trimmed.startsWith("www.")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function extractLinksFromText(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of matches) {
    const normalized = normalizeUrl(match);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function extractLinksFromBuffer(buffer: Buffer): string[] {
  const content = buffer.toString("latin1");
  return extractLinksFromText(content);
}

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
    let extractedLinks: string[] = [];

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
      extractedLinks = [
        ...extractLinksFromText(extractedText),
        ...extractLinksFromBuffer(buffer),
      ];
    } else if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      // Parse PDF
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const data = await pdfParse(buffer);
      extractedText = data.text;
      extractedLinks = [
        ...extractLinksFromText(extractedText),
        ...extractLinksFromBuffer(buffer),
      ];
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a .docx or .pdf file." },
        { status: 400 }
      );
    }
    console.log("[parse-resume] extractedText sample:", {
      fileName,
      length: extractedText.length,
      preview: extractedText.slice(0, 500),
    });

    return NextResponse.json({
      success: true,
      text: extractedText,
      links: Array.from(new Set(extractedLinks)),
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
