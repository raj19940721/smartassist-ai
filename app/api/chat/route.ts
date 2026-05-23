import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const completion =
      await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: body.message,
          },
        ],
      });

    const reply =
      completion.choices[0]?.message?.content;

    return Response.json({
      reply,
    });
  } catch (error) {
    console.error(
      "FULL API ERROR:",
      error
    );

    return Response.json(
      {
        error: "API failed",
      },
      {
        status: 500,
      }
    );
  }
}