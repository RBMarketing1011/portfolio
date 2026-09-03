import Link from 'next/link'

export default function SiteFooter() {
	return (
		<footer className='border-t border-white/10 bg-[#03080f] px-6 py-10 sm:px-10 lg:px-16'>
			<div className='mx-auto flex max-w-6xl flex-col gap-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between'>
				<Link
					href='/'
					className='font-display text-base font-semibold text-white'>
					Reynolds<span className='text-[#1684f5]'>Build</span>.dev
				</Link>
				<p>Custom software for businesses built to grow.</p>
				<p>© {new Date().getFullYear()} ReynoldsBuild.dev</p>
			</div>
		</footer>
	)
}
