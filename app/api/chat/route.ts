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
        model: "llama3-8b-8192",
        stream: true,
        messages: [
          {
            role: "user",
            content: body.message,
          },
        ],
      });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of completion) {
          const text =
            chunk.choices[0]?.delta?.content || "";

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                response: text,
              }) + "\n"
            )
          );
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain",
      },
    });
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        error: "Something went wrong",
      }),
      {
        status: 500,
      }
    );
  }
}