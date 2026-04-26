import React, { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  nodeId?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class NodeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Node ${this.props.nodeId} crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 min-w-[180px] min-h-[80px]">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <p className="text-xs text-destructive font-medium">Node Error</p>
          <p className="text-[10px] text-muted-foreground max-w-[160px] truncate">
            {this.state.error?.message || 'Unknown error'}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
