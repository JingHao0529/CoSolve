import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-paper p-6">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-3 items-center">
            <span className="w-10 h-10 rounded-lg bg-danger-soft grid place-items-center shrink-0">
              <AlertCircle className="h-5 w-5 text-danger" />
            </span>
            <h1 className="display text-2xl">
              Page not found
            </h1>
          </div>

          <p className="mt-3 text-sm text-ink-soft">
            The page you requested is not part of this workspace.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
