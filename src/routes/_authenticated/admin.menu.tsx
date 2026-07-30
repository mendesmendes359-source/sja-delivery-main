import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ProductImage } from "@/components/product-image";
import { AppSelect } from "@/components/ui/app-select";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import type { RouteLoaderArgs } from "@/router-context";

type EditableMenuItem = {
  id?: string;
  name: string;
  description?: string | null;
  price_aoa: string;
  category_id: string | null;
  available?: boolean;
  image_url?: string | null;
  sort_order?: number;
};

type EditableCategory = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const menuAdminQO = queryOptions({
  queryKey: ["admin", "menu"],
  queryFn: async () => {
    const [categories, items] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").order("sort_order"),
    ]);
    if (categories.error) throw categories.error;
    if (items.error) throw items.error;
    return { categories: categories.data ?? [], items: items.data ?? [] };
  },
});

export const Route = createFileRoute("/_authenticated/admin/menu")({
  loader: ({ context }: RouteLoaderArgs) => context.queryClient.ensureQueryData(menuAdminQO),
  component: MenuAdmin,
});

function MenuAdmin() {
  const { data } = useSuspenseQuery(menuAdminQO);
  const categoryOptions = data.categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditableMenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<EditableCategory | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  function invalidateMenu() {
    queryClient.invalidateQueries({ queryKey: ["admin", "menu"] });
    queryClient.invalidateQueries({ queryKey: ["menu"] });
  }

  function closeItemEditor() {
    setEditing(null);
    setImageFile(null);
    setImagePreview(null);
  }

  function openNewItem() {
    const nextSort =
      data.items.reduce((maximum, item) => Math.max(maximum, item.sort_order), 0) + 1;
    setEditing({
      name: "",
      description: "",
      price_aoa: "",
      available: true,
      category_id: data.categories[0]?.id ?? null,
      image_url: null,
      sort_order: nextSort,
    });
    setImageFile(null);
    setImagePreview(null);
  }

  function openItem(item: (typeof data.items)[number]) {
    setEditing({
      ...item,
      price_aoa: Math.round(item.price_cents / 100).toString(),
    });
    setImageFile(null);
    setImagePreview(item.image_url);
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!IMAGE_EXTENSIONS[file.type]) {
      toast.error("Escolha uma imagem JPEG, PNG ou WebP");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("A imagem não pode exceder 5 MB");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setImagePreview(String(reader.result));
    reader.readAsDataURL(file);
    setImageFile(file);
  }

  const saveItem = useMutation({
    mutationFn: async (item: EditableMenuItem) => {
      const name = item.name.trim();
      const price = Number(item.price_aoa);
      if (name.length < 2) throw new Error("Indique um nome válido");
      if (!Number.isFinite(price) || price <= 0) throw new Error("Indique um preço válido");
      if (!item.category_id) throw new Error("Escolha uma categoria");

      let imageUrl = item.image_url || null;
      if (imageFile) {
        const extension = IMAGE_EXTENSIONS[imageFile.type];
        const path = `menu-items/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("menu-images")
          .upload(path, imageFile, {
            cacheControl: "31536000",
            contentType: imageFile.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
      }

      const payload = {
        name,
        description: item.description?.trim() || null,
        price_cents: Math.round(price * 100),
        category_id: item.category_id,
        available: item.available ?? true,
        image_url: imageUrl,
        sort_order: Number(item.sort_order ?? 0),
      };

      if (item.id) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("menu_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateMenu();
      closeItemEditor();
      toast.success("Produto guardado");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMenu();
      toast.success("Produto removido");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      const cleanName = name.trim();
      const slug = slugify(cleanName);
      if (cleanName.length < 2 || !slug) throw new Error("Indique um nome válido");
      const { error } = await supabase.from("categories").insert({
        name: cleanName,
        slug,
        sort_order: data.categories.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMenu();
      setNewCategory("");
      toast.success("Categoria criada");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const saveCategory = useMutation({
    mutationFn: async (category: EditableCategory) => {
      const name = category.name.trim();
      const slug = slugify(name);
      if (name.length < 2 || !slug) throw new Error("Indique um nome válido");
      const { error } = await supabase
        .from("categories")
        .update({ name, slug, sort_order: Number(category.sort_order) })
        .eq("id", category.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMenu();
      setEditingCategory(null);
      toast.success("Categoria atualizada");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      if (data.items.some((item) => item.category_id === id)) {
        throw new Error("Mova ou remova os produtos desta categoria primeiro");
      }
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMenu();
      toast.success("Categoria removida");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Menu</h1>
          <p className="text-sm text-muted-foreground">
            Edite categorias, produtos, preços e imagens do frontoffice
          </p>
        </div>
        <button
          type="button"
          onClick={openNewItem}
          disabled={data.categories.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo produto
        </button>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Categorias</h2>
        <p className="text-xs text-muted-foreground">
          Categorias com produtos só podem ser eliminadas depois de esvaziadas.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {data.categories.map((category) => {
            const itemCount = data.items.filter((item) => item.category_id === category.id).length;
            return (
              <div
                key={category.id}
                className="inline-flex items-center gap-1 rounded-full border bg-background py-1 pl-3 pr-1 text-sm"
              >
                <span>
                  {category.name}{" "}
                  <span className="text-xs text-muted-foreground">({itemCount})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditingCategory(category)}
                  aria-label={`Editar categoria ${category.name}`}
                  className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    confirm(`Remover a categoria "${category.name}"?`) &&
                    deleteCategory.mutate(category.id)
                  }
                  aria-label={`Remover categoria ${category.name}`}
                  className="grid h-7 w-7 place-items-center rounded-full text-brand hover:bg-accent disabled:opacity-35"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (newCategory.trim()) addCategory.mutate(newCategory);
            }}
          >
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="Nova categoria"
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={!newCategory.trim() || addCategory.isPending}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              Adicionar
            </button>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Produto</th>
                <th className="px-4 py-2">Categoria</th>
                <th className="px-4 py-2">Preço</th>
                <th className="px-4 py-2">Disponível</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((item) => {
                const category = data.categories.find((entry) => entry.id === item.category_id);
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          src={item.image_url}
                          name={item.name}
                          sizes="48px"
                          className="h-12 w-12 shrink-0 rounded-md"
                        />
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="max-w-sm truncate text-xs text-muted-foreground">
                            {item.description || "Sem descrição"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {category?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2">{formatMoney(item.price_cents)}</td>
                    <td className="px-4 py-2">{item.available ? "✓" : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        aria-label={`Editar ${item.name}`}
                        className="mr-1 rounded p-2 hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          confirm(`Remover o produto "${item.name}"?`) && deleteItem.mutate(item.id)
                        }
                        aria-label={`Remover ${item.name}`}
                        className="rounded p-2 text-brand hover:bg-accent"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeItemEditor();
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-item-dialog-title"
            className="my-4 w-full max-w-2xl rounded-xl bg-card p-6 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              saveItem.mutate(editing);
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="menu-item-dialog-title" className="font-display text-xl font-bold">
                  {editing.id ? "Editar produto" : "Novo produto"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Os dados guardados ficam imediatamente visíveis no frontoffice.
                </p>
              </div>
              <button
                type="button"
                onClick={closeItemEditor}
                aria-label="Fechar"
                className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
              <div>
                <ProductImage
                  src={imagePreview}
                  name={editing.name || "Produto"}
                  className="aspect-[4/3] w-full rounded-lg"
                />
                <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm font-medium hover:border-brand hover:text-brand">
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  {imageFile ? "Trocar imagem" : "Carregar imagem"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={selectImage}
                    className="sr-only"
                  />
                </label>
                <p className="mt-2 text-xs text-muted-foreground">
                  JPEG, PNG ou WebP · máximo 5 MB
                </p>
                {imagePreview ? (
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                      setEditing({ ...editing, image_url: null });
                    }}
                    className="mt-2 text-xs font-medium text-brand hover:underline"
                  >
                    Remover imagem
                  </button>
                ) : null}
              </div>

              <div className="grid content-start gap-3">
                <label className="text-sm">
                  Nome
                  <input
                    required
                    minLength={2}
                    value={editing.name}
                    onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                    className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  Descrição
                  <textarea
                    value={editing.description ?? ""}
                    onChange={(event) =>
                      setEditing({ ...editing, description: event.target.value })
                    }
                    className="mt-1 min-h-24 w-full rounded border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Preço (Kz)
                    <input
                      required
                      type="number"
                      step="1"
                      min="1"
                      value={editing.price_aoa}
                      onChange={(event) =>
                        setEditing({ ...editing, price_aoa: event.target.value })
                      }
                      className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    Ordem
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={editing.sort_order ?? 0}
                      onChange={(event) =>
                        setEditing({ ...editing, sort_order: Number(event.target.value) })
                      }
                      className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="text-sm">
                  Categoria
                  <AppSelect
                    required
                    name="category_id"
                    value={editing.category_id ?? ""}
                    onValueChange={(categoryId) =>
                      setEditing({ ...editing, category_id: categoryId })
                    }
                    options={categoryOptions}
                    ariaLabel="Categoria do produto"
                    placeholder="Escolher categoria"
                    className="mt-1"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.available ?? true}
                    onChange={(event) =>
                      setEditing({ ...editing, available: event.target.checked })
                    }
                  />
                  Disponível para encomenda
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeItemEditor}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saveItem.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
              >
                {saveItem.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {saveItem.isPending ? "A guardar..." : "Guardar produto"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editingCategory ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingCategory(null);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-dialog-title"
            className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              saveCategory.mutate(editingCategory);
            }}
          >
            <h2 id="category-dialog-title" className="font-display text-xl font-bold">
              Editar categoria
            </h2>
            <div className="mt-4 grid gap-3">
              <label className="text-sm">
                Nome
                <input
                  required
                  minLength={2}
                  value={editingCategory.name}
                  onChange={(event) =>
                    setEditingCategory({ ...editingCategory, name: event.target.value })
                  }
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                Ordem
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editingCategory.sort_order}
                  onChange={(event) =>
                    setEditingCategory({
                      ...editingCategory,
                      sort_order: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saveCategory.isPending}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
              >
                {saveCategory.isPending ? "A guardar..." : "Guardar categoria"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
