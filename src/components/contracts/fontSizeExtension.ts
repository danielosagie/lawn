import { Extension } from "@tiptap/core";

/**
 * Adds a `fontSize` attribute to the `textStyle` mark, with
 * commands to set / unset it. Tiptap doesn't ship this out of the
 * box; the official @tiptap/extension-text-style only handles
 * color + fontFamily. This is the canonical recipe from the Tiptap
 * issue tracker.
 *
 * Usage:
 *   editor.chain().focus().setFontSize("14px").run()
 *   editor.chain().focus().unsetFontSize().run()
 */
declare module "@tiptap/core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.style.fontSize?.replace(/['"]/g, "") || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});
