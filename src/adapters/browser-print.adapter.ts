import type { PrintPort } from '../ports/print.port';

type PrintTarget = Pick<Window, 'print' | 'addEventListener' | 'removeEventListener'>;

export class BrowserPrintAdapter implements PrintPort {
  constructor(private readonly target: PrintTarget = window) {}

  print(afterPrint?: () => void): void {
    const target = this.target;
    if (afterPrint && target.addEventListener) {
      const handler = () => {
        target.removeEventListener?.('afterprint', handler);
        afterPrint();
      };
      target.addEventListener('afterprint', handler);
    }
    target.print();
  }
}
