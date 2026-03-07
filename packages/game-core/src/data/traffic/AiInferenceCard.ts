import { TrafficCard } from '../../types.js';

export class AiInferenceCard extends TrafficCard {
  readonly templateId = 'traffic-ai-inference';
  readonly name = 'AI Model Inference';
  readonly revenue = 10_000;
  readonly description = 'GPU-intensive inference requests for large language models and diffusion pipelines.';

  constructor(public readonly id: string = 'traffic-ai-inference') {
    super();
  }
}
