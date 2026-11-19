import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

import { Logo } from '@/components/logo';
import meta from '@/generated/meta.json';

import { appName, npmUrl, repoUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="size-5 text-fd-primary" />
          {appName}
          <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-normal text-fd-muted-foreground">
            v{meta.version}
          </span>
        </span>
      ),
    },
    githubUrl: repoUrl,
    links: [
      { text: 'Documentation', url: '/docs/guides/getting-started', active: 'nested-url' },
      { text: 'npm', url: npmUrl, external: true },
    ],
  };
}
