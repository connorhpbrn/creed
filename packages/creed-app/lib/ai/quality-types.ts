export type QualityNote = { title: string; detail: string; tag?: string };

export type AnalysisGuidanceType = "edit" | "ask" | "remove" | "move" | "review";

export type AnalysisGuidance = {
  type: AnalysisGuidanceType;
  title: string;
  detail: string;
  targetSectionIds: string[];
  requiresUserInput: boolean;
};

export type CreedQualityReport = {
  contentHash: string;
  overall: {
    score: number;
    summary: string;
    tags: string[];
    strength: QualityNote | null;
    gap: QualityNote | null;
    guidance: AnalysisGuidance | null;
    // Compatibility mirrors for reports and clients created before Guidance.
    strengths: string[];
    gaps: string[];
    focus: string[];
  };
  sections: Array<{
    sectionId: string;
    sectionName: string;
    score: number;
    tags: string[];
    strength: QualityNote | null;
    gap: QualityNote | null;
    guidance: AnalysisGuidance | null;
    reasons: string[];
    strengths: string[];
    gaps: string[];
    missingContext: string[];
    focus: string;
  }>;
  generatedAt: string;
};
