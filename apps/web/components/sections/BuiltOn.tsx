import { HardDrive, KeyRound, Lock } from 'lucide-react';
import { Container } from '@/components/ui/Container';

// The quick trust signal under the hero. Truthful only: the three pieces of the Sui stack Reeg is
// actually built on, labelled by what each one does (generic function icons, not official logos).
const STACK = [
  { name: 'Sui', role: 'Ownership & proof', icon: KeyRound },
  { name: 'Walrus', role: 'Storage', icon: HardDrive },
  { name: 'Seal', role: 'Encryption', icon: Lock },
];

export function BuiltOn() {
  return (
    <section className="border-y border-border bg-muted/30">
      <Container className="flex flex-col items-center gap-6 py-9">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Built on the Sui stack
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {STACK.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.name} className="flex items-center gap-2.5">
                <Icon
                  className="h-5 w-5 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="text-base font-semibold tracking-tight text-foreground">
                  {item.name}
                </span>
                <span className="hidden text-sm text-muted-foreground sm:inline">{item.role}</span>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
