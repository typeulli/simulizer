import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

/**
 * Extract the preferred language from the Accept-Language header.
 * Supported languages: en, ja, ko, zh
 */
function parseLanguageHeader(header: string): string {
  if (!header) return "en";

  // Accept-Language format: en-US,en;q=0.9,ko;q=0.8
  const languages = header
    .split(",")
    .map((lang) => {
      const [code] = lang.split(";");
      return code.trim().toLowerCase();
    });

  // Supported languages
  const supported = ["en", "ja", "ko", "zh"];

  for (const lang of languages) {
    // Exact match (e.g., ko)
    if (supported.includes(lang)) {
      return lang;
    }

    // Extract language code only (e.g., ko-KR → ko)
    const base = lang.split("-")[0];
    if (supported.includes(base)) {
      return base;
    }
  }

  return "en"; // Default fallback
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    
    // Determine the target language code
    let targetCode = code;
    
    if (code === "auto") {
      // Auto-detect language from Accept-Language header
      const acceptLanguage = request.headers.get("accept-language") || "";
      targetCode = parseLanguageHeader(acceptLanguage);
    }

    // Dynamically import the language file from the lang folder
    try {
      const langModule = await import(`@/lang/${targetCode}`);
      const langData = langModule.default;
      
      const etag = `"${createHash("md5").update(JSON.stringify(langData)).digest("hex")}"`;
      const ifNoneMatch = request.headers.get("if-none-match");

      if (ifNoneMatch === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag } });
      }

      return NextResponse.json(langData, {
        headers: {
          "Content-Type": "application/json",
          ETag: etag,
        },
      });
    } catch (error) {
      // Fallback to 'en' if the requested language is not available
      const langModule = await import("@/lang/en");
      const langData = langModule.default;

      const etag = `"${createHash("md5").update(JSON.stringify(langData)).digest("hex")}"`;
      const ifNoneMatch = request.headers.get("if-none-match");

      if (ifNoneMatch === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag } });
      }

      return NextResponse.json(langData, {
        headers: {
          "Content-Type": "application/json",
          ETag: etag,
        },
      });
    }
  } catch (error) {
    console.error("Language pack error:", error);
    return NextResponse.json(
      { error: "Failed to load language pack" },
      { status: 500 }
    );
  }
}
