'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatTzs,
  opusBadgeClass,
  type ProductCategory,
  type ProductRecord,
} from '@opusfesta/lib';
import { compressImage } from '@/lib/compress-image';
import { cn } from '@/lib/utils';
import { uploadStorefrontPhoto } from '../sections/actions';
import { deleteProduct, saveProduct, setProductPublished } from './actions';

type FormState = {
  id?: string;
  name: string;
  category_slug: string;
  description: string;
  price: string;
  compareAt: string;
  stock: string;
  madeToOrder: boolean;
  published: boolean;
  images: string[];
};

const EMPTY_FORM: FormState = {
  id: undefined,
  name: '',
  category_slug: '',
  description: '',
  price: '',
  compareAt: '',
  stock: '',
  madeToOrder: false,
  published: true,
  images: [],
};

function StatusPill({ product }: { product: ProductRecord }) {
  if (product.status === 'approved') {
    return (
      <span className={opusBadgeClass({ tone: 'success', size: 'small' })}>
        <Check className="h-3 w-3" /> Live
      </span>
    );
  }
  if (product.status === 'rejected') {
    return (
      <span
        className={opusBadgeClass({ tone: 'error', size: 'small' })}
        title={product.rejection_note ?? undefined}
      >
        <AlertCircle className="h-3 w-3" /> Rejected
      </span>
    );
  }
  return (
    <span className={opusBadgeClass({ tone: 'warning', size: 'small' })}>
      <AlertCircle aria-hidden="true" /> In review
    </span>
  );
}

export function ProductsEditor({
  initialProducts,
  categories,
}: {
  initialProducts: ProductRecord[];
  categories: ProductCategory[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<ProductRecord | null>(
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function openCreate() {
    setError(null);
    setForm({ ...EMPTY_FORM, category_slug: categories[0]?.slug ?? '' });
  }

  function openEdit(p: ProductRecord) {
    setError(null);
    setForm({
      id: p.id,
      name: p.name,
      category_slug: p.category_slug ?? '',
      description: p.description ?? '',
      price: String(p.price_tzs),
      compareAt: p.compare_at_price_tzs ? String(p.compare_at_price_tzs) : '',
      stock: p.stock_quantity === null ? '' : String(p.stock_quantity),
      madeToOrder: p.made_to_order,
      published: p.published,
      images: p.images,
    });
  }

  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = '';
    if (files.length === 0) return;
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        const fd = new FormData();
        fd.set('file', compressed);
        fd.set('kind', 'products');
        const res = await uploadStorefrontPhoto(fd);
        if (res.ok) {
          setForm((f) => (f ? { ...f, images: [...f.images, res.url] } : f));
        } else {
          setError(res.error);
        }
      } catch {
        setError(`Could not upload ${file.name}.`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function submit() {
    if (!form) return;
    const price = parseInt(form.price.replace(/[^\d]/g, ''), 10);
    if (!form.name.trim() || form.name.trim().length < 2) {
      setError('Give the product a name.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter a price in TZS.');
      return;
    }
    const compareAt = parseInt(form.compareAt.replace(/[^\d]/g, ''), 10);
    const stock = form.stock.trim() === '' ? null : parseInt(form.stock, 10);
    if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
      setError('Stock must be 0 or more, or left blank for untracked.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await saveProduct({
        id: form.id,
        name: form.name,
        category_slug: form.category_slug || null,
        description: form.description || null,
        highlights: [],
        price_tzs: price,
        compare_at_price_tzs:
          Number.isFinite(compareAt) && compareAt > price ? compareAt : null,
        images: form.images,
        stock_quantity: stock,
        made_to_order: form.madeToOrder,
        published: form.published,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProducts((prev) => {
        const exists = prev.some((p) => p.id === res.product.id);
        return exists
          ? prev.map((p) => (p.id === res.product.id ? res.product : p))
          : [...prev, res.product];
      });
      setForm(null);
    });
  }

  function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setBusyId(target.id);
    startTransition(async () => {
      const res = await deleteProduct(target.id);
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== target.id));
        setPendingDelete(null);
      } else {
        setError(res.error ?? 'Could not delete.');
      }
      setBusyId(null);
    });
  }

  function togglePublished(p: ProductRecord) {
    setBusyId(p.id);
    startTransition(async () => {
      const res = await setProductPublished(p.id, !p.published);
      if (res.ok) {
        setProducts((prev) =>
          prev.map((x) =>
            x.id === p.id ? { ...x, published: !p.published } : x
          )
        );
      } else {
        setError(res.error ?? 'Could not update visibility.');
      }
      setBusyId(null);
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-500">
          New and edited products go through a quick OpusFesta review before
          they appear publicly in the registry shop.
        </p>
        <button
          data-opus-button="primary"
          data-opus-button-size="medium"
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" /> Add product
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {products.length === 0 && !form ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center">
          <Package className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-900">No products yet</p>
          <p className="max-w-sm text-sm text-gray-500">
            Add your first product — photos, price, and stock — and it will
            appear in the OpusFesta registry shop once approved.
          </p>
          <button
            data-opus-button="primary"
            data-opus-button-size="medium"
            type="button"
            onClick={openCreate}
            className="mt-1 inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" /> Add your first product
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex flex-col overflow-hidden rounded-2xl border bg-white',
                p.published ? 'border-gray-200' : 'border-gray-200 opacity-70'
              )}
            >
              <div className="relative aspect-square w-full bg-gray-50">
                {p.images[0] ? (
                  <Image
                    src={p.images[0]}
                    alt={p.name}
                    fill
                    sizes="(min-width: 1024px) 300px, 45vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <Package className="h-8 w-8" />
                  </div>
                )}
                <span className="absolute left-2 top-2">
                  <StatusPill product={p} />
                </span>
                {!p.published ? (
                  <span className="absolute right-2 top-2 rounded-full bg-gray-900/80 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Hidden
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">
                  {p.name}
                </h3>
                <p className="mt-1 text-sm font-bold text-gray-900">
                  {formatTzs(p.price_tzs)}
                  {p.compare_at_price_tzs ? (
                    <span className="ml-2 text-xs font-normal text-gray-400 line-through">
                      {formatTzs(p.compare_at_price_tzs)}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {p.made_to_order
                    ? 'Made to order'
                    : p.stock_quantity === null
                      ? 'Stock untracked'
                      : `${p.stock_quantity} in stock`}
                </p>
                {p.status === 'rejected' && p.rejection_note ? (
                  <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                    {p.rejection_note}
                  </p>
                ) : null}
                <div className="flex-1" />
                <div className="mt-3 flex items-center gap-1.5">
                  <button
                    data-opus-button="control"
                    type="button"
                    onClick={() => openEdit(p)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    data-opus-button="control"
                    type="button"
                    onClick={() => togglePublished(p)}
                    disabled={busyId === p.id}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {p.published ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> Hide
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Show
                      </>
                    )}
                  </button>
                  <button
                    data-opus-button="control"
                    type="button"
                    onClick={() => setPendingDelete(p)}
                    aria-label={`Delete ${p.name}`}
                    className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setForm(null)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {form.id ? 'Edit product' : 'Add product'}
              </h2>
              <button
                data-opus-button="control"
                type="button"
                onClick={() => setForm(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Name
                </span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={120}
                  placeholder="Cast-iron 3-piece cookware set"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Category
                </span>
                <select
                  value={form.category_slug}
                  onChange={(e) =>
                    setForm({ ...form, category_slug: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
                >
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Price (TZS)
                  </span>
                  <input
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: e.target.value })
                    }
                    inputMode="numeric"
                    placeholder="250000"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Was price (optional)
                  </span>
                  <input
                    value={form.compareAt}
                    onChange={(e) =>
                      setForm({ ...form, compareAt: e.target.value })
                    }
                    inputMode="numeric"
                    placeholder="320000"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 items-end gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Stock (blank = untracked)
                  </span>
                  <input
                    value={form.stock}
                    onChange={(e) =>
                      setForm({ ...form, stock: e.target.value })
                    }
                    inputMode="numeric"
                    placeholder="e.g. 12"
                    disabled={form.madeToOrder}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.madeToOrder}
                    onChange={(e) =>
                      setForm({ ...form, madeToOrder: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Made to order
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Description
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={3}
                  maxLength={2000}
                  placeholder="What it is, what's included, and why couples love it."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Photos
                </span>
                <div className="flex flex-wrap gap-2">
                  {form.images.map((url) => (
                    <div
                      key={url}
                      className="relative h-20 w-20 overflow-hidden rounded-lg bg-gray-50"
                    >
                      <Image
                        src={url}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                      <button
                        data-opus-button="control"
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            images: form.images.filter((u) => u !== url),
                          })
                        }
                        aria-label="Remove photo"
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    data-opus-button="control"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading > 0}
                    className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">
                      {uploading > 0 ? 'Uploading…' : 'Add'}
                    </span>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    onChange={onPickImages}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) =>
                    setForm({ ...form, published: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                Visible in the shop once approved
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                data-opus-button="control"
                type="button"
                onClick={() => setForm(null)}
                className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                data-opus-button="primary"
                data-opus-button-size="medium"
                type="button"
                onClick={submit}
                disabled={pending || uploading > 0}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {pending ? 'Saving…' : form.id ? 'Save changes' : 'Add product'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setPendingDelete(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-gray-900">
              Delete this product?
            </h2>
            <p className="mt-1.5 text-sm text-gray-500">
              “{pendingDelete.name}” will be removed from your shop and any
              registries that link to it will keep only a snapshot.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                data-opus-button="control"
                type="button"
                onClick={() => setPendingDelete(null)}
                className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                data-opus-button="danger"
                data-opus-button-size="medium"
                type="button"
                onClick={confirmDelete}
                disabled={busyId === pendingDelete.id}
                className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
