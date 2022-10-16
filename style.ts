// import { syntaxTree } from '@codemirror/language';
// import { Extension, RangeSetBuilder, StateField, Transaction } from '@codemirror/state';
// import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { EditorPosition } from 'obsidian';


export class Position implements EditorPosition {
    line: number;
    ch: number;

    constructor(line: number, ch: number) {
        this.line = line;
        this.ch = ch;
    }
}


export class Range {
    from: EditorPosition;
    to: EditorPosition;

    constructor(from: EditorPosition, to: EditorPosition) {
        this.from = from;
        this.to = to;
    }
}

// export var higlightedRanges: Range[] = [];

// export const HighlightLink = StateField.define<DecorationSet>(
// {
//     create(state): DecorationSet 
//     {
//         console.log("create");

//         const editorView = state.field(editorEditorField);
//         editorView.dom.parentElement.removeClass("is-zoomed-in");

//         return Decoration.none;
//     },
//     update(oldState: DecorationSet, transaction: Transaction): DecorationSet 
//     {
//         const builder = new RangeSetBuilder<Decoration>();

        
        
//         // add .suggested-link class to characters in the highlighted ranges

//         var lines = document.getElementsByClassName("cm-line");
//         for (var i = 0; i < lines.length; i++)
//         {
//             console.log("line: " + i);
//             for (const range of higlightedRanges)
//             {
//                 if (range.from.line == i)
//                 {
//                     console.log("highlighting from: " + range.from.ch + " to: " + range.to.ch);
//                     builder.add(range.from.ch, range.to.ch, Decoration.mark({ class: "suggested-link" }));
//                 }
//             }
//         }
//         return builder.finish();
//     },
//     provide(field: StateField<DecorationSet>): Extension 
//     {
//         return EditorView.decorations.from(field);
//     },
// });