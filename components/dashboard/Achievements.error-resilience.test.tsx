import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { Achievement } from '@/types/dashboard';

const {
  shouldThrowLucideIcon,
  shouldThrowDataService,
  mockFetchAchievements,
  mockTelemetryTrackException,
} = vi.hoisted(() => ({
  shouldThrowLucideIcon: { current: false },
  shouldThrowDataService: { current: false },
  mockFetchAchievements: vi.fn(),
  mockTelemetryTrackException: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => {
      const safeProps = { ...props };
      delete safeProps.initial;
      delete safeProps.whileInView;
      delete safeProps.viewport;
      delete safeProps.transition;
      return (
        <div className={className} {...safeProps}>
          {children}
        </div>
      );
    },
  },
}));

vi.mock('lucide-react', () => ({
  Trophy: (props: React.SVGProps<SVGSVGElement>) => {
    if (shouldThrowLucideIcon.current) {
      throw new Error('Unexpected runtime exception');
    }
    return <svg data-testid="trophy-icon" aria-hidden="true" {...props} />;
  },
  Flame: (props: React.SVGProps<SVGSVGElement>) => {
    if (shouldThrowLucideIcon.current) {
      throw new Error('Unexpected runtime exception');
    }
    return <svg data-testid="flame-icon" aria-hidden="true" {...props} />;
  },
  Sparkles: (props: React.SVGProps<SVGSVGElement>) => {
    if (shouldThrowLucideIcon.current) {
      throw new Error('Unexpected runtime exception');
    }
    return <svg data-testid="sparkles-icon" aria-hidden="true" {...props} />;
  },
}));

import Achievements from './Achievements';

const healthyAchievements: Achievement[] = [
  {
    id: 'streak-7',
    title: 'Week Warrior',
    description: 'Maintained a 7-day streak',
    icon: '🔥',
    type: 'streak',
    isUnlocked: true,
    currentValue: 7,
    threshold: 7,
    progress: 100,
  },
  {
    id: 'contrib-100',
    title: 'Centurion',
    description: '100 total contributions',
    icon: '🏆',
    type: 'contributions',
    isUnlocked: false,
    currentValue: 42,
    threshold: 100,
    progress: 42,
  },
];

type TestErrorBoundaryProps = {
  children: ReactNode;
  onReset?: () => void;
  onTelemetry?: (error: Error, errorInfo: ErrorInfo) => void;
};

type TestErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class TestErrorBoundary extends Component<TestErrorBoundaryProps, TestErrorBoundaryState> {
  state: TestErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): TestErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    mockTelemetryTrackException(error, errorInfo);
    this.props.onTelemetry?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" data-testid="achievements-error-fallback">
          <h2>Something went wrong</h2>
          <p data-testid="achievements-error-message">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <p>We were unable to load your achievements. Please try again.</p>
          <button type="button" onClick={this.handleRetry}>
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function AchievementsDataLoader(): React.ReactElement {
  if (shouldThrowDataService.current) {
    throw new Error('Database connection failed');
  }

  const achievements = mockFetchAchievements();
  return <Achievements achievements={achievements} />;
}

describe('Achievements — Hydration Stability, Exception Safety & Error Fallbacks', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shouldThrowLucideIcon.current = false;
    shouldThrowDataService.current = false;
    mockFetchAchievements.mockReturnValue(healthyAchievements);
    mockTelemetryTrackException.mockClear();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('Test 1: catches a runtime child component failure and renders recovery UI without crashing', () => {
    shouldThrowLucideIcon.current = true;

    render(
      <TestErrorBoundary>
        <Achievements achievements={healthyAchievements} />
      </TestErrorBoundary>
    );

    expect(screen.getByTestId('achievements-error-fallback')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('achievements-error-message')).toHaveTextContent(
      'Unexpected runtime exception'
    );
    expect(screen.getByText(/unable to load your achievements/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText('Week Warrior')).not.toBeInTheDocument();
  });

  it('Test 2: surfaces a data service failure as an error state with a user-facing recovery message', () => {
    shouldThrowDataService.current = true;

    render(
      <TestErrorBoundary>
        <AchievementsDataLoader />
      </TestErrorBoundary>
    );

    expect(screen.getByTestId('achievements-error-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('achievements-error-message')).toHaveTextContent(
      'Database connection failed'
    );
    expect(
      screen.getByText('We were unable to load your achievements. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(mockFetchAchievements).not.toHaveBeenCalled();
  });

  it('Test 3: completes hydration safely with malformed or inconsistent achievement data', () => {
    const inconsistentHydrationData = [
      {
        id: 'hydration-mismatch',
        title: '',
        description: undefined as unknown as string,
        icon: '',
        type: 'streak' as const,
        isUnlocked: false,
        currentValue: NaN,
        threshold: 0,
        progress: -1,
      },
      {
        id: 'server-client-drift',
        title: 'Hydration mismatch detected',
        description: 'Progress value differs between server and client',
        icon: '🏆',
        type: 'behavior' as const,
        isUnlocked: true,
        currentValue: undefined as unknown as number,
        threshold: undefined as unknown as number,
        progress: undefined as unknown as number,
      },
    ] as Achievement[];

    expect(() =>
      render(
        <TestErrorBoundary>
          <Achievements achievements={inconsistentHydrationData} />
        </TestErrorBoundary>
      )
    ).not.toThrow();

    expect(screen.queryByTestId('achievements-error-fallback')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /achievements/i })).toBeInTheDocument();
    expect(screen.getByText('Hydration mismatch detected')).toBeInTheDocument();
    expect(mockTelemetryTrackException).not.toHaveBeenCalled();
  });

  it('Test 4: logs unexpected exceptions to the telemetry tracker with correct error details', () => {
    shouldThrowLucideIcon.current = true;
    const runtimeError = new Error('Unexpected runtime exception');

    render(
      <TestErrorBoundary>
        <Achievements achievements={healthyAchievements} />
      </TestErrorBoundary>
    );

    expect(mockTelemetryTrackException).toHaveBeenCalledTimes(1);
    expect(mockTelemetryTrackException).toHaveBeenCalledWith(
      expect.objectContaining({ message: runtimeError.message }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
    expect(screen.getByTestId('achievements-error-message')).toHaveTextContent(
      'Unexpected runtime exception'
    );
  });

  it('Test 5: exposes a recovery action that resets error state and re-renders Achievements', () => {
    shouldThrowLucideIcon.current = true;
    const onReset = vi.fn();

    const { rerender } = render(
      <TestErrorBoundary onReset={onReset}>
        <Achievements achievements={healthyAchievements} />
      </TestErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrowLucideIcon.current = false;
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(onReset).toHaveBeenCalledTimes(1);

    rerender(
      <TestErrorBoundary onReset={onReset}>
        <Achievements achievements={healthyAchievements} />
      </TestErrorBoundary>
    );

    expect(screen.queryByTestId('achievements-error-fallback')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /achievements/i })).toBeInTheDocument();
    expect(screen.getByText('Week Warrior')).toBeInTheDocument();
    expect(screen.getByText('Centurion')).toBeInTheDocument();
  });
});
