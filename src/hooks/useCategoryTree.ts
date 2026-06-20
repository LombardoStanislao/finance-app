import { useState, useEffect } from 'react'
import { supabase, type Category } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export interface CategoryWithChildren extends Category {
    children?: CategoryWithChildren[]
}

export function useCategoryTree() {
    const { user } = useAuth()
    const [flatCategories, setFlatCategories] = useState<Category[]>([])
    const [categoryTree, setCategoryTree] = useState<CategoryWithChildren[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (user) {
            loadCategories()
        } else {
            setFlatCategories([])
            setCategoryTree([])
            setLoading(false)
        }
    }, [user])

    async function loadCategories() {
        if (!user) return
        setLoading(true)
        try {
            const { data } = await supabase
                .from('categories')
                .select('*')
                .eq('user_id', user.id)
                .order('name')

            const flat = data || []
            setFlatCategories(flat)

            const categoryMap = new Map<string, CategoryWithChildren>()
            const rootCategories: CategoryWithChildren[] = []

            flat.forEach(cat => categoryMap.set(cat.id, { ...cat, children: [] }))
            flat.forEach(cat => {
                if (cat.parent_id) {
                    const parent = categoryMap.get(cat.parent_id)
                    if (parent) parent.children?.push(categoryMap.get(cat.id)!)
                } else {
                    rootCategories.push(categoryMap.get(cat.id)!)
                }
            })

            // Sort roots and children
            const sortFn = (a: CategoryWithChildren, b: CategoryWithChildren) => a.name.localeCompare(b.name)
            rootCategories.sort(sortFn)
            rootCategories.forEach(root => root.children?.sort(sortFn))

            setCategoryTree(rootCategories)
        } catch (error) {
            console.error('Error loading categories:', error)
        } finally {
            setLoading(false)
        }
    }

    return { flatCategories, categoryTree, loading, reloadCategories: loadCategories }
}
