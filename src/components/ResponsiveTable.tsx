import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode, type TableHTMLAttributes } from 'react';

type Element = ReactElement<{ children?: ReactNode; colSpan?: number; className?: string; 'data-label'?: string; role?: string }>;
function elements(children: ReactNode): Element[] {
  return Children.toArray(children).flatMap((child) => !isValidElement(child) ? [] : child.type === Fragment ? elements((child as Element).props.children) : [child as Element]);
}
function label(children: ReactNode): string {
  return Children.toArray(children).map((child) => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement(child) ? label((child as Element).props.children) : '').join(' ').replace(/\s+/g, ' ').trim();
}

/** Uses the table's own headings as card labels; all original data and actions are retained. */
export default function ResponsiveTable({ children, className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  const sections = elements(children);
  const head = sections.find((child) => child.type === 'thead');
  const headingRow = head && elements(head.props.children).find((child) => child.type === 'tr');
  const headings = headingRow ? elements(headingRow.props.children).map((cell) => label(cell.props.children)) : [];
  const size = headings.length >= 7 ? 'wide' : headings.length >= 4 ? 'medium' : 'small';
  const content = sections.map((section) => {
    if (section.type !== 'tbody') return section;
    return cloneElement(section, { role: 'rowgroup' }, elements(section.props.children).map((row) => {
      if (row.type !== 'tr') return row;
      let column = 0;
      return cloneElement(row, { role: 'row' }, elements(row.props.children).map((cell) => {
        const text = cell.props['data-label'] || headings[column] || 'Details';
        column += cell.props.colSpan ?? 1;
        if (cell.type !== 'td' && cell.type !== 'th') return cell;
        const actions = /^actions?$/i.test(text);
        return cloneElement(cell, {
          'data-label': text,
          className: `${cell.props.className ?? ''}${actions ? ' adaptive-actions-cell' : ''}`,
          role: cell.type === 'th' ? 'rowheader' : 'cell',
        }, <div className="adaptive-cell-value">{cell.props.children}</div>);
      }));
    }));
  });
  return <div className={`adaptive-table adaptive-table--${size}`}>
    <table {...props} role="table" className={`adaptive-data-table ${className}`}>{content}</table>
  </div>;
}
