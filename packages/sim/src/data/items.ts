// Item components (docs/design.md section 6). Combined items and all effects aren't designed yet,
// so components can only be collected (docs/game-spec.md section 1).

export const COMPONENTS = ['blade', 'bow', 'mail', 'cloak', 'lembas', 'staff'] as const;

export type ComponentId = (typeof COMPONENTS)[number];

export const COMPONENT_NAMES: Readonly<Record<ComponentId, string>> = {
  blade: 'Blade',
  bow: 'Bow',
  mail: 'Mail',
  cloak: 'Cloak',
  lembas: 'Lembas',
  staff: 'Staff',
};
