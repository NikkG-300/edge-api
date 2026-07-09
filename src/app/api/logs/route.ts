import { neon } from "@neondatabase/serverless";

export const runtime = "edge";

const sql = neon(process.env.DATABASE_URL!);

const MAX_BYTES = 10_000;

export async function POST(req: Request) {
  const contentLength = req.headers.get("content-length");

  if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message } = body as { message?: string };

  if (!message || typeof message !== "string") {
    return Response.json(
      { error: "Field 'message' is required and must be a string" },
      { status: 400 }
    );
  }

  try {
    const result = await sql`
      INSERT INTO logs (message)
      VALUES (${message})
      RETURNING id, message, created_at
    `;
    return Response.json({ log: result[0] }, { status: 201 });
  } catch (err) {
    return Response.json({ error: "Database insert failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, message, created_at
      FROM logs
      ORDER BY created_at DESC
      LIMIT 20
    `;
    return Response.json(
      { count: rows.length, data: rows },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    return Response.json({ error: "Database query failed" }, { status: 500 });
  }
}
