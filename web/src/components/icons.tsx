/**
 * Agent glyphs. Line icons on a 24-box, stroked with currentColor so the hex
 * badge's accent drives them.
 */
const P = (d: string) => (props: { size?: number }) => (
  <svg
    width={props.size ?? 24}
    height={props.size ?? 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

export const ICONS: Record<string, (props: { size?: number }) => JSX.Element> = {
  pen: P('M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z M13.5 6.5l4 4'),
  upload: P('M12 16V4 M7 9l5-5 5 5 M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2'),
  sync: P('M20 12a8 8 0 0 1-13.7 5.6L4 15.4 M4 12a8 8 0 0 1 13.7-5.6L20 8.6 M4 20v-4.6h4.6 M20 4v4.6h-4.6'),
  chart: P('M4 20V10 M10 20V4 M16 20v-7 M22 20H2'),
  sun: P('M12 4V2 M12 22v-2 M4 12H2 M22 12h-2 M6 6 4.5 4.5 M19.5 19.5 18 18 M18 6l1.5-1.5 M4.5 19.5 6 18 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'),
  shield: P('M12 3l7 3v5c0 4.4-2.9 8.4-7 10-4.1-1.6-7-5.6-7-10V6l7-3Z M9 12l2 2 4-4'),
  heart: P('M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z'),
  gear: P('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7 2 2 0 1 1 0 4Z'),
  target: P('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'),
  wave: P('M2 12c2.5-4 5-4 7.5 0s5 4 7.5 0 2.5-4 5 0 M2 17c2.5-4 5-4 7.5 0s5 4 7.5 0'),
  pulse: P('M2 12h4l3-8 4 16 3-8h6'),
  sparkle: P('M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z'),
};

export function AgentIcon({ name, size }: { name: string; size?: number }) {
  const Glyph = ICONS[name] ?? ICONS['gear']!;
  return <Glyph size={size} />;
}
