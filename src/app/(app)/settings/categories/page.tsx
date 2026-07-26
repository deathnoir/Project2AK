import { Screen, ScreenTitle } from '@/components/ui/primitives'
import { createClient } from '@/lib/supabase/server'
import { CategoryEditor } from './category-editor'

export const metadata = { title: 'Categories · Project2AK' }

export default async function CategoriesSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .is('deleted_at', null)
    .order('sort_order')

  return (
    <Screen>
      <ScreenTitle>Categories</ScreenTitle>
      <CategoryEditor categories={categories ?? []} />
    </Screen>
  )
}
