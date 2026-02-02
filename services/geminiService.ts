
import { GoogleGenAI, Type } from "@google/genai";
import { IdentificationResult, CatalogItem } from "../types";

export const identifyParts = async (images: string[], catalog?: CatalogItem[]): Promise<IdentificationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const imageParts = images.map(img => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: img.split(',')[1]
    }
  }));

  let prompt = "Analyze these images of an automotive part taken from different angles. Identify the part and provide a list of matches including part number, name, station location, specific vehicle model, and color. Return ONLY the top matches that have at least 70% confidence. Be precise and technical.";

  if (catalog && catalog.length > 0) {
    prompt += `\n\nIMPORTANT: Use this reference catalog to verify the Part Number, Name, and Station location. Even if the catalog doesn't list the model or color, identify those from the visual data:\n${JSON.stringify(catalog)}`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          ...imageParts,
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            parts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  partNumber: { type: Type.STRING },
                  partName: { type: Type.STRING },
                  station: { type: Type.STRING },
                  model: { type: Type.STRING },
                  color: { type: Type.STRING },
                  matchPercentage: { type: Type.NUMBER },
                  description: { type: Type.STRING },
                  category: { type: Type.STRING }
                },
                required: ["partNumber", "partName", "station", "model", "color", "matchPercentage"]
              }
            },
            summary: { type: Type.STRING }
          },
          required: ["parts", "summary"]
        }
      }
    });

    if (!response.text) throw new Error("No response from AI");
    
    const result: IdentificationResult = JSON.parse(response.text.trim());
    return result;
  } catch (error) {
    console.error("Error identifying part:", error);
    throw error;
  }
};
