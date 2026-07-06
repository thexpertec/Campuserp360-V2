export interface Cat { id: string; name: string; parentId: string | null; description: string | null; active: boolean; sortOrder: number; }

export type NodeLevel = 1 | 2 | 3;

export interface TreeNode extends Cat { level: NodeLevel; children: TreeNode[]; }

export const CAT_QUERY_KEY = ["store-item-categories"];

export function buildCatTree(flat: Cat[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const c of flat) byId.set(c.id, { ...c, level: 1, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (!node.parentId) { node.level = 1; roots.push(node); }
    else {
      const parent = byId.get(node.parentId);
      if (parent) { node.level = (parent.level < 3 ? parent.level + 1 : 3) as NodeLevel; parent.children.push(node); }
      else { node.level = 1; roots.push(node); }
    }
  }
  const sort = (ns: TreeNode[]) => { ns.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); ns.forEach(n => sort(n.children)); };
  sort(roots);
  return roots;
}
