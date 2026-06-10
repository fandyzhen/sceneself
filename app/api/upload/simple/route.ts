import { NextRequest, NextResponse } from "next/server";
import { getActiveSessionUser } from "@/lib/auth/session";
import { getErrorMessage } from "@/lib/error-utils";

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "This demo upload endpoint is disabled in production." }, { status: 404 });
    }

    // Authenticate user
    const access = await getActiveSessionUser(req.headers);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be less than 5MB" }, { status: 400 });
    }

    const testImageUrl = "/starter/sample.png";
    
    console.log('Image uploaded (using test URL for now)');

    return NextResponse.json({ 
      url: testImageUrl, // Use test URL for now
      originalName: file.name,
      size: file.size,
      type: file.type,
      message: "Using a local starter image for non-production demo upload."
    });

  } catch (error: unknown) {
    console.error("Upload error:", error);
    return NextResponse.json({ 
      error: getErrorMessage(error, "Failed to upload file"),
    }, { status: 500 });
  }
}
