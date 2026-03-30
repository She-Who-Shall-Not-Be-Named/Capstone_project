import { analyzeAdapterJob, Combined, pickContent } from "@/app/api/data-ingestion/nlp/client"; 
import { analysis, analysisWithLLM } from "@/app/api/data-ingestion/nlp/index";           
import { htmlToPlainText } from "@/app/api/data-ingestion/adapters/util";        
import type { AdapterJob } from "@/app/api/data-ingestion/adapters/types";


export type scoringTypes = {
    featuresNormalized: Partial<Combined>; 
    analysis: analysis;                     
};

export async function analyzeAndScoreJob(jobData: AdapterJob): Promise<scoringTypes> {
    
    // Gives database fields 
    const features: Combined = await analyzeAdapterJob(jobData);

    // Re-extract the clean text from the job object for the second LLM call.
    const html = pickContent(jobData); 
    const plainText = htmlToPlainText(html)


    const analysisResult = await analysisWithLLM({
        text: plainText,
        metadata: {
            time_type: features.time_type ?? null,
            currency: (features.currency ?? null) as string | null,
        },
    });

    return {
        featuresNormalized: features,
        analysis: analysisResult,
    };
}