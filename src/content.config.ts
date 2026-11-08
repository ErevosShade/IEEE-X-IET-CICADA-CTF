import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const tracks = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/tracks' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    mode: z.enum(['seed', 'core', 'frontier', 'forge', 'open', 'research']),
    index: z.number(),
    status: z.enum(['open', 'closed', 'invite-only', 'coming-soon']).default('open'),
    registrationUrl: z.string().optional(),
    statementsUrl: z.string().optional(),
    hackathonStatementsUrl: z.string().optional(),
    facts: z.array(z.string()).default([]),
  }),
});

const announcements = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/announcements' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.string().default('General'),
    pinned: z.boolean().default(false),
  }),
});

export const collections = { tracks, announcements };
