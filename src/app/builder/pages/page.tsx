import { loadTemplates } from '@/lib/builder/load-templates'
import { BuilderStart } from './builder-start'

export default async function PagesIndex() {
	return <BuilderStart templates={await loadTemplates()} />
}
