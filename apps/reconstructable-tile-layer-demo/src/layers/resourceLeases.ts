type Closeable = { close(): void };
const references = new WeakMap<Closeable, number>();

/** 编辑器和已添加图层各持一份引用；必须先释放切片，再释放其 dataset。 */
export function retainResources(resources: (Closeable | undefined)[]): () => void {
  const owned = [...new Set(resources.filter((item): item is Closeable => !!item))];
  for (const resource of owned) references.set(resource, (references.get(resource) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const resource of owned) {
      const count = (references.get(resource) ?? 1) - 1;
      if (count > 0) references.set(resource, count);
      else {
        references.delete(resource);
        resource.close();
      }
    }
  };
}
