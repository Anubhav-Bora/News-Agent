declare module 'pdfkit' {
    class PDFDocument {
        constructor(options?: {
            size?: string | [number, number];
            margin?: number;
            bufferPages?: boolean;
            autoFirstPage?: boolean;
            layout?: 'portrait' | 'landscape';
        });

        pipe(destination: NodeJS.WritableStream): this;
        fontSize(size: number): this;
        text(text: string, options?: {
            align?: 'left' | 'center' | 'right' | 'justify';
            width?: number;
            height?: number;
            ellipsis?: boolean | string;
            columns?: number;
            columnGap?: number;
            indent?: number;
            paragraphGap?: number;
            lineGap?: number;
            wordSpacing?: number;
            characterSpacing?: number;
            fill?: boolean;
            link?: string;
            underline?: boolean;
            strike?: boolean;
            continued?: boolean;
        }): this;
        font(name: string): this;
        moveDown(lines?: number): this;
        addPage(options?: {
            margin?: number;
            layout?: 'portrait' | 'landscape';
        }): this;
        image(src: Buffer | string, options?: {
            width?: number;
            height?: number;
            fit?: [number, number];
            align?: 'left' | 'center' | 'right';
            valign?: 'top' | 'center' | 'bottom';
        }): this;
        end(): void;
    }

    export default PDFDocument;
}
