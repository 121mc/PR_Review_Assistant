import { NextResponse } from "next/server";
import { parseGitHubUrl } from "../../../../lib/url";
import { jsonError } from "../../../../lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { code: "INVALID_GITHUB_URL", message: "url is required and must be a string" },
        { status: 400 },
      );
    }

    const parsed = parseGitHubUrl(url);
    return NextResponse.json(parsed, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("github.com")) {
        return NextResponse.json(
          { code: "INVALID_GITHUB_URL", message: error.message },
          { status: 400 },
        );
      }
      if (error.message.toLowerCase().includes("unsupported")) {
        return NextResponse.json(
          { code: "UNSUPPORTED_GITHUB_URL", message: error.message },
          { status: 400 },
        );
      }
    }
    return jsonError(error, "PARSE_URL_ERROR", 500);
  }
}
