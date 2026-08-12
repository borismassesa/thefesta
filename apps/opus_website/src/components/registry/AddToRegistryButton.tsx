'use client'

import { useState } from 'react'
import { Check, Minus, Plus, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { opusButtonClass } from '@opusfesta/lib'
import { addToRegistryBag } from '@/lib/registry-storage'
import type { Product } from '@/lib/registry-products'

type Props = {
  product: Pick<Product, 'id' | 'name' | 'img' | 'price'> & { category: string }
  variant?: 'card' | 'pdp'
  quantity?: number
}

export default function AddToRegistryButton({ product, variant = 'card', quantity: fixedQuantity = 1 }: Props) {
  const [added, setAdded] = useState(false)
  const [quantity, setQuantity] = useState(fixedQuantity)

  function onAdd(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    addToRegistryBag({
      category: product.category,
      id: product.id,
      name: product.name,
      img: product.img,
      price: product.price,
      quantity,
    })
    toast.success(`Added "${product.name}" to your cart`)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  if (variant === 'pdp') {
    return (
      <div className="space-y-3">
        <div className="inline-flex items-center gap-4 rounded-full border border-gray-300 px-4 py-2">
          <button data-opus-button="control"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="text-gray-500 hover:text-gray-900"
          >
            <Minus size={14} />
          </button>
          <span className="w-4 text-center text-sm font-semibold text-gray-900">{quantity}</span>
          <button data-opus-button="control"
            aria-label="Increase quantity"
            onClick={() => setQuantity((q) => q + 1)}
            className="text-gray-500 hover:text-gray-900"
          >
            <Plus size={14} />
          </button>
        </div>
        <button
          onClick={onAdd}
          className={`w-full ${opusButtonClass({ size: 'large' })}`}
        >
          {added ? <Check size={16} /> : <ShoppingBag size={16} />}
          {added ? 'Added to cart' : 'Add to cart'}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={onAdd}
      className={`w-full ${opusButtonClass({ variant: 'neutral', size: 'small' })}`}
    >
      {added ? <Check size={13} /> : <ShoppingBag size={13} />}
      {added ? 'Added' : 'Add to cart'}
    </button>
  )
}
