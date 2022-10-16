import { App, Editor, editorInfoField, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, EditorPosition } from 'obsidian';

import BTree from 'sorted-btree'
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
} from '@codemirror/view';
import {Position, Range} from 'style';

// file class
class Linkable
{
	path: string;
	name: string;
	simmilarity: number = 0;
	suggestion: Suggestion;

	constructor(path: string, name: string) {
		this.path = path;
		this.name = name;
	}
}	

var files_tree = new BTree(undefined, (a: string, b: string) => 
{
	if (a > b)
      return 1;
    else if (a < b)
      return -1;
    else
      return 1;
});

var headers_tree = new BTree(undefined, (a: string, b: string) =>
{
	if (a > b)
	  return 1;
	else if (a < b)
	  return -1;
	else
	  return 1;
})

const removalKeys = ['Backspace', 'Delete'];
const keysThatAddACharacter = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ' ', '-', '_', '.', ',', '!', '?', ':', ';', '(', ')', '[', ']', '{', '}', '/', '\\', '|', '<', '>', '=', '+', '*', '&', '^', '%', '$', '#', '@', '~', '`', '\'', '"'];
const wordDelimiters = [' ', 'Tab', 'Enter', '\t', '\n', '(', ')', '[', ']', '{', '}', '<', '>', '"', ',', '.', ';', ':', '/', '\\', '-', '*', '!', '?'];

class Suggestion
{
	matchedString: string;
	line: number;
	char: number;
	length: number;
	range: Range;
	linkables: Linkable[];

	highlightElement: HTMLElement;

	constructor(matchedString: string, line: number, char: number, linkables: Linkable[]) 
	{
		this.matchedString = matchedString;
		this.line = line;
		this.char = char;
		this.length = matchedString.length;
		this.linkables = linkables;

		this.range = new Range(new Position(this.line, this.char), new Position(this.line, this.char + this.length));

		for (let i = 0; i < this.linkables.length; i++)
		{
			this.linkables[i].suggestion = this;
		}
	}

	shiftCharBy(offset: number)
	{
		this.char += offset;
		this.range = new Range(new Position(this.line, this.char), new Position(this.line, this.char + this.length));
	}

	shiftLineBy(offset: number)
	{
		this.line += offset;
		this.range = new Range(new Position(this.line, this.char), new Position(this.line, this.char + this.length));
	}
}

// cm6 view plugin
function matchHighlighter() {
	return ViewPlugin.fromClass(
		class HighlightPlugin 
		{
			decorations: DecorationSet;

			constructor(public view: EditorView) 
			{
				this.decorations = Decoration.none;
			}

			applyHighlight(suggestionsToHighlight: Suggestion[]) 
			{
				const deco = [];
				const view = app.workspace.getActiveViewOfType(MarkdownView);
				
				if (view == null) 
				{
					console.log("view is null");
					return;
				}
				
				// sort by range 'from' position
				suggestionsToHighlight = suggestionsToHighlight.sort((a, b) =>
				{
					if (a.range.from.ch > b.range.from.ch)
					{
						return 1;
					}
					else if (a.range.from.ch < b.range.from.ch)
					{
						return -1;
					}
					else
					{
						return 0;
					}
				});

				const editor = view.editor;
				const highlight = Decoration.mark({class: 'link-suggestion'});

				for (let i = 0; i < suggestionsToHighlight.length; i++)
				{
					let suggestion = suggestionsToHighlight[i];
					const posFrom = Math.max(editor.posToOffset(suggestion.range.from), 0);
					const posTo = Math.min(editor.posToOffset(suggestion.range.to), editor.getLine(suggestion.line).length);
					deco.push(highlight.range(posFrom, posTo));
				}
				
				if (deco.length > 0)
					this.decorations = Decoration.set(deco);
				else
					this.clearHighlight();
			}

			clearHighlight()
			{
				this.decorations = Decoration.none;
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);
}

export default class LinkSuggestions extends Plugin 
{
	currentSuggestions: Suggestion[] = [];
	cm6Highlighter = matchHighlighter();
	cm6Editor: any;

	applyHighlight(suggestionsToHighlight: Suggestion[])
	{
		this.cm6Editor.plugin(this.cm6Highlighter).applyHighlight(suggestionsToHighlight);
	}

	clearHighlight()
	{
		this.cm6Editor.plugin(this.cm6Highlighter).clearHighlight();
	}

	async onload() 
	{
		console.log('loading plugin');

		this.registerEditorExtension(this.cm6Highlighter);
		this.cm6Editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor.cm;

		if (this.cm6Editor == null)
		{
			console.log("cm6 editor is null");
			return;
		}

		this.addCommand({
			id: 'find-link-suggestions',
			name: 'Find Link Suggestions',
			callback: () => {this.FindSuggestionsOnCursor()}
		});

		this.RebuildTree();

		this.app.workspace.onLayoutReady(() => {
			this.registerDomEvent(document, 'keydown', (event) => this.handleKeyDown(event));
		});
	}

	handleKeyDown(event: KeyboardEvent): void {

		let view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view == null) 
		{
			console.log("not in a markdown view");
			return;
		}

		let editor = view.editor;
	
		for(let i = 0; i < this.currentSuggestions.length; i++)
		{
			let suggestion = this.currentSuggestions[i];

			//if character was entered before the end of the suggestion, remove it
			if (editor.posToOffset(suggestion.range.to) > editor.posToOffset(editor.getCursor()))
			{
				this.currentSuggestions.splice(i, 1);
				i--;
			}
		}

		if (wordDelimiters.contains(event.key)) 
		{
			this.currentSuggestions = this.currentSuggestions.concat(this.FindSuggestionsOnCursor());
		}

		if (this.currentSuggestions.length >= 10)
		{
			this.currentSuggestions = this.currentSuggestions.slice(1, 10);
		}

		this.currentSuggestions = this.MakeSuggestionsUnique(this.currentSuggestions);

		this.applyHighlight(this.currentSuggestions);
	}

	async RebuildTree()
	{
		console.log('building database');

		files_tree.clear();
		headers_tree.clear();

		var files = this.app.vault.getMarkdownFiles();

		for (var i = 0; i < files.length; i++) 
		{
			var file = files[i];
			var path = file.path.replace('.md', '').toLowerCase();
			var name = file.basename;

			var linkable = new Linkable(path, name);
			files_tree.set(name.toLowerCase(), linkable);

			let fileContents = await this.app.vault.read(file);

			// headers are lines that start with between 1 and 6 hashes followed by a space
			let headers = fileContents.match(/^#{1,6} .*/gm);

			if (headers)
			{
				for (let header of headers)
				{
					let headerName = header.replace(/^#{1,6} /, '');
					let headerPath = (file.path + '#' + headerName).toLowerCase();

					if (headerName.trim().length == 0) continue;

					let headerLinkable = new Linkable(headerPath, headerName);
					headers_tree.set(headerName.toLowerCase(), headerLinkable);
				}
			}
		}
	}

	StringEditDistance(a: string, b: string) 
	{
		// https://stackoverflow.com/questions/10473745/compare-strings-javascript-return-of-likely
		a = a.toLowerCase();
		b = b.toLowerCase();
	  
		var costs = new Array();
		for (var i = 0; i <= a.length; i++) {
		  var lastValue = i;
		  for (var j = 0; j <= b.length; j++) {
			if (i == 0)
			  costs[j] = j;
			else {
			  if (j > 0) {
				var newValue = costs[j - 1];
				if (a.charAt(i - 1) != b.charAt(j - 1))
				  newValue = Math.min(Math.min(newValue, lastValue),
					costs[j]) + 1;
				costs[j - 1] = lastValue;
				lastValue = newValue;
			  }
			}
		  }
		  if (i > 0)
			costs[b.length] = lastValue;
		}
		return costs[b.length];
	}

	
	GetStringSimimilarity(a: string, b: string)
	{
		// https://stackoverflow.com/questions/10473745/compare-strings-javascript-return-of-likely
		var longer = a;
		var shorter = b;
		if (a.length < b.length) {
			longer = a;
			shorter = b;
		}
		var longerLength = longer.length;
		if (longerLength == 0) {
			return 1.0;
		}
		return (longerLength - this.StringEditDistance(longer, shorter)) / longerLength;
	}

	GetAllWithName(name:string, tree: BTree<string, Linkable>) : BTree<string, Linkable>
	{
		return tree.filter((key: string, value: Linkable) => {
			let simmilarity = this.GetStringSimimilarity(key, name);
			let required_sim = Math.clamp(2.5/Math.log2(key.length), 0.05, 0.9);
			
			if (simmilarity >= required_sim)
			{
				value.simmilarity = simmilarity;
			}

			return simmilarity >= required_sim;
		});
	}

	GetAllFilesWithName(name: string): Linkable[]
	{
		name = name.toLowerCase();

		var files = this.GetAllWithName(name, files_tree);

		var values = files.valuesArray();

		var valuesCopy: Linkable[] = [];

		for (var i = 0; i < values.length; i++)
		{
			let linkable = new Linkable(values[i].path, values[i].name);
			linkable.simmilarity = values[i].simmilarity;
			valuesCopy.push(linkable);
		}

		return valuesCopy;
	}

	GetAllHeadersWithName(name: string): Linkable[]
	{
		name = name.toLowerCase();

		var headers = this.GetAllWithName(name, headers_tree);

		var values = headers.valuesArray();

		var valuesCopy: Linkable[] = [];

		for (var i = 0; i < values.length; i++)
		{
			let linkable = new Linkable(values[i].path, values[i].name);
			linkable.simmilarity = values[i].simmilarity;
			valuesCopy.push(linkable);
		}

		return valuesCopy;
	}

	MakeLinkablesUnique(suggestions: Suggestion[])
	{
		var allLinkables: Linkable[] = [];

		// populate allLinkables
		for (let suggestion of suggestions)
		{
			allLinkables = allLinkables.concat(suggestion.linkables);
		}

		//remove items with an imperfect simmilarity that also contain a perfect match
		for (let i = 0; i < allLinkables.length; i++)
		{
			let item = allLinkables[i];

			if (item.simmilarity < 0.9  && item.suggestion.matchedString.contains(item.name))
			{
				console.log('removing ' + item.suggestion.matchedString);
				allLinkables.remove(item);
				i--;
				continue;
			}
		}

		// only keep duplicates with the highest simmilarity
		for (let i = 0; i < allLinkables.length; i++)
		{
			let item = allLinkables[i];

			for (let j = i + 1; j < allLinkables.length; j++)
			{
				let other = allLinkables[j];

				if (item.path == other.path)
				{
					if (item.simmilarity > other.simmilarity)
					{
						allLinkables.splice(j, 1);
						j--;
					}
					else
					{
						allLinkables.splice(i, 1);
						i--;
						break;
					}
				}
			}
		}

		// redistribute linkables to their repective suggestions
		for (let i = 0; i < suggestions.length; i++)
		{
			suggestions[i].linkables = [];
		}

		for (let i = 0; i < allLinkables.length; i++)
		{
			let linkable = allLinkables[i];
			linkable.suggestion.linkables.push(linkable);
		}
	}

	MakeSuggestionsUnique(suggestions: Suggestion[])
	{
		//remove suggestion duplicates by range
		this.currentSuggestions = this.currentSuggestions.filter((thing, index, self) =>
			index === self.findIndex((t) => (
				t.range.from.line === thing.range.from.line && t.range.from.ch === thing.range.from.ch
				&& t.range.to.line === thing.range.to.line && t.range.to.ch === thing.range.to.ch
			))
		)

		// sort suggestions by average simmilarity of all their linkables
		suggestions.sort((a, b) => {
			return this.AvgArray(b.linkables.map(x => x.simmilarity)) - this.AvgArray(a.linkables.map(x => x.simmilarity));
		});

		// sort linkables by simmilarity
		for (let i = 0; i < suggestions.length; i++)
		{
			let suggestion = suggestions[i];
			suggestion.linkables.sort((a, b) => {
				return b.simmilarity - a.simmilarity;
			});
		}

		// only keep the first 11 linkables for each suggestion
		for (let i = 0; i < suggestions.length; i++)
		{
			let suggestion = suggestions[i];
			suggestion.linkables = suggestion.linkables.slice(0, 11);
		}

		//remove suggestions with no linkables
		suggestions = suggestions.filter(s => s.linkables.length > 0);

		return suggestions;
	}

	AvgArray(arr: number[]) : number
	{
		return arr.reduce((a, b) => a + b, 0) / arr.length;
	}

	FindSuggestionsOnCursor(): Suggestion[]
	{
		console.log('Finding suggestions');

		var suggestions: Suggestion[] = [];
		var allLinkables: Linkable[] = [];

		let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		let maxWords = 8;
		if (activeView)
		{
			var cursor = activeView.editor.getCursor();

			// go backwards from cursor one word at a time checking for a match to a file name or header name
			
			let line = activeView.editor.getLine(cursor.line)

			//walk forwards to the end of the word
			for (let i = cursor.ch; i < line.length; i++)
			{
				if (wordDelimiters.contains(line[i]))
				{
					line = line.substring(0, i);
					break;
				}
			}

			// back backwards checking after every word
			var wordsChecked = 0;
			var charIndex = line.length - 1;
			while (wordsChecked < maxWords && charIndex >= 0)
			{
				if (wordDelimiters.contains(line[charIndex]) || charIndex == 0)
				{
					if (charIndex != 0)
						var word = line.substring(charIndex+1);
					else
						var word = line.substring(charIndex);

					word = word.trim();

					if(word.length == 0) 
					{
						charIndex--;
						continue;
					}
					
					console.log('checking word: ' + word);

					var linkables: Linkable[] = [];

					// check if word is a file name
					let files = this.GetAllFilesWithName(word);
					if (files.length > 0)
					{
						linkables = linkables.concat(files);
						allLinkables = allLinkables.concat(files);
					}

					// check if word is a header name
					let headers = this.GetAllHeadersWithName(word);
					if (headers.length > 0)
					{
						linkables = linkables.concat(headers);
						allLinkables = allLinkables.concat(headers);
					}

					let ch = charIndex != 0 ? charIndex + 1 : charIndex;

				    let suggestion = new Suggestion(word, cursor.line, ch, linkables);
					suggestions.push(suggestion);

					wordsChecked++;
				}

				charIndex--;
			}

			suggestions = this.MakeSuggestionsUnique(suggestions);
			this.MakeLinkablesUnique(suggestions);

			//print results
			for (let i = 0; i < suggestions.length; i++)
			{
				let suggestion = suggestions[i];
				console.log('\nsuggestion: ' + suggestion.matchedString);
				for (let j = 0; j < suggestion.linkables.length; j++)
				{
					let linkable = suggestion.linkables[j];
					console.log('    ' + linkable.name + ' ' + linkable.simmilarity);
				}
			}
		}

		

		return suggestions;
	}

	onunload() 
	{
		console.log('unloading plugin');
		files_tree.clear();
		headers_tree.clear();
	}
}



