
export interface SentimentResult {
  label: string;   
  score: number;   
}

export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  if (!process.env.HF_API_KEY) {
    throw new Error("Missing HF_API_KEY environment variable");
  }

  const response = await fetch(
    "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    }
  );

  if (!response.ok) {
    throw new Error(`HF API error: ${response.statusText}`);
  }

  const data = await response.json();


  const result = data[0][0] as SentimentResult;
  return result;
}
