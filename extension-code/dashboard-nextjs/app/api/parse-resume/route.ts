import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import * as zlib from "zlib";

/**
 * URL extraction regex patterns for comprehensive link detection.
 * Handles:
 * - Full URLs with scheme: https://github.com/user/repo
 * - www URLs: www.example.com/path
 * - Bare domains: linkedin.com/in/username, github.com/user
 * - github.io portfolio URLs: user.github.io/portfolio
 */
const URL_WITH_SCHEME_REGEX = /https?:\/\/[^\s<>()\[\]{}"']+/gi;
const WWW_URL_REGEX = /www\.[^\s<>()\[\]{}"']+/gi;
const BARE_DOMAIN_REGEX = /(linkedin\.com|github\.com|gitlab\.com|bitbucket\.org|medium\.com|dev\.to|stackoverflow\.com|kaggle\.com|huggingface\.co)[^\s<>()\[\]{}"']*/gi;
const GITHUB_IO_REGEX = /[a-z0-9-]+\.github\.io[^\s<>()\[\]{}"']*/gi;
const TRAILING_PUNCT_REGEX = /[)\].,;:!?]+$/;

/**
 * Normalize a URL:
 * - Remove trailing punctuation
 * - Prepend https:// if missing scheme
 * - Clean up whitespace artifacts from PDF extraction
 * - Filter out font/system URLs
 */
function normalizeUrl(raw: string): string {
  // Remove trailing punctuation
  let cleaned = raw.replace(TRAILING_PUNCT_REGEX, "");
  
  // Remove any internal whitespace (PDF extraction artifact)
  cleaned = cleaned.replace(/\s+/g, "");
  
  // Prepend https:// if missing scheme
  if (!cleaned.match(/^https?:\/\//i)) {
    cleaned = `https://${cleaned}`;
  }
  
  return cleaned;
}

/**
 * Check if a URL is a system/font URL (should be filtered out)
 */
function isSystemUrl(url: string): boolean {
  const systemPatterns = [
    /ams\.org/i,
    /scripts\.sil\.org/i,
    /pfaedit\.sf\.net/i,
    /fontforge/i,
    /sourceforge\.net.*font/i,
  ];
  return systemPatterns.some(p => p.test(url));
}

/**
 * Extract all URLs from text using multiple patterns.
 * Handles various URL formats including bare domains.
 */
function extractLinksFromText(text: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const allMatches: string[] = [];
  
  // Collect matches from all patterns
  allMatches.push(...(text.match(URL_WITH_SCHEME_REGEX) || []));
  allMatches.push(...(text.match(WWW_URL_REGEX) || []));
  allMatches.push(...(text.match(BARE_DOMAIN_REGEX) || []));
  allMatches.push(...(text.match(GITHUB_IO_REGEX) || []));
  
  for (const match of allMatches) {
    const normalized = normalizeUrl(match);
    if (!normalized || normalized.length < 10 || seen.has(normalized)) continue;
    // Filter out system URLs (fonts, etc.)
    if (isSystemUrl(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

/**
 * Extract links from raw PDF/DOCX buffer (may contain hyperlink annotations).
 */
function extractLinksFromBuffer(buffer: Buffer): string[] {
  const content = buffer.toString("latin1");
  return extractLinksFromText(content);
}

/**
 * Extract URLs from compressed PDF streams.
 * LaTeX/hyperref PDFs store hyperlinks in FlateDecode-compressed streams.
 * This function finds and decompresses those streams to extract URLs.
 */
function extractLinksFromPdfStreams(buffer: Buffer): string[] {
  const content = buffer.toString("latin1");
  const allUrls: string[] = [];
  
  // Find FlateDecode streams (compressed content)
  const streamPattern = /stream\n([\s\S]*?)\nendstream/g;
  let match;
  
  while ((match = streamPattern.exec(content)) !== null) {
    const streamData = match[1];
    
    try {
      // Convert latin1 string back to buffer and decompress
      const streamBuffer = Buffer.from(streamData, "latin1");
      const decompressed = zlib.inflateSync(streamBuffer);
      const text = decompressed.toString("utf8");
      
      // Extract URLs from decompressed content
      const urls = extractLinksFromText(text);
      allUrls.push(...urls);
    } catch {
      // Not a zlib-compressed stream or compression failed - skip
    }
  }
  
  return allUrls;
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
      
      // Extract links from:
      // 1. Visible text content
      // 2. Raw buffer (uncompressed annotations)
      // 3. Compressed PDF streams (LaTeX/hyperref links)
      extractedLinks = [
        ...extractLinksFromText(extractedText),
        ...extractLinksFromBuffer(buffer),
        ...extractLinksFromPdfStreams(buffer),
      ];
      
      console.log("[parse-resume] PDF link extraction:", {
        fromText: extractLinksFromText(extractedText).length,
        fromBuffer: extractLinksFromBuffer(buffer).length,
        fromStreams: extractLinksFromPdfStreams(buffer).length,
        total: extractedLinks.length,
      });
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
