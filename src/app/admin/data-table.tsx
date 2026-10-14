import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'

export function DataTable({
	columns,
	rows,
	empty,
}: {
	columns: string[]
	rows: React.ReactNode[][]
	empty: string
}) {
	return (
		<div className='rounded-xl border border-white/10'>
			<Table>
				<TableHeader>
					<TableRow>
						{columns.map((column) => (
							<TableHead key={column}>{column}</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row, index) => (
						<TableRow key={index}>
							{row.map((cell, i) => (
								<TableCell key={i} className={i === 0 ? 'font-medium' : undefined}>
									{cell}
								</TableCell>
							))}
						</TableRow>
					))}
					{!rows.length && (
						<TableRow>
							<TableCell
								colSpan={columns.length}
								className='text-muted-foreground py-8 text-center'>
								{empty}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	)
}
