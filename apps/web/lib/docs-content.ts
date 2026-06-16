import fs from 'node:fs';
import path from 'node:path';
import { docTitle } from './docs';

/** Read a doc's markdown by slug from content/docs. Server-only (touches the filesystem). */
export function getDoc(slug: string): { title: string; content: string } | null {
  const file = path.join(process.cwd(), 'content', 'docs', `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  return { title: docTitle(slug), content: fs.readFileSync(file, 'utf8') };
}
