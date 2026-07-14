import { logger } from './logger.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly cooldownMs: number = 60_000
  ) {}

  isAllowed(): boolean {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN — testing single request');
        return true;
      }
      return false;
    }

    return true;
  }

  onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info('Circuit breaker closing — LLM recovered');
    }
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn('Circuit breaker reopened — half-open test failed');
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(
        { failureCount: this.failureCount, threshold: this.failureThreshold },
        'Circuit breaker OPENED — LLM failures exceeded threshold'
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

export const scoringCircuitBreaker = new CircuitBreaker(5, 60_000);
