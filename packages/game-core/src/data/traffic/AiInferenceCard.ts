import { Period, TrafficCard } from '../../types.js';

export class AiInferenceCard extends TrafficCard {
  readonly templateId = 'traffic-ai-inference';
  readonly name = 'AI Model Inference';
  readonly revenue = 10_000;
  readonly description = 'GPU-intensive inference requests for large language models and diffusion pipelines.';
  override readonly flavorText = 'The model is thinking. Your invoice is thinking faster.';
  // Business-hours batch jobs with weekly arc; weekend = hobbyist evening use.
  override readonly weekTable = [
    Period.Morning,   // Mon — pipeline kickoff
    Period.Afternoon, // Tue
    Period.Afternoon, // Wed
    Period.Afternoon, // Thu
    Period.Morning,   // Fri — teams wrap up before weekend
    Period.Evening,   // Sat
    Period.Evening,   // Sun
  ] as const;

  constructor(public readonly id: string = 'traffic-ai-inference') {
    super();
  }
}
