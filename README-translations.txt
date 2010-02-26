Translating Keyring

Instructions for translators

In the 'resources' directory, find the subdirectory for your language
and locale (eg. 'de_de' for German in Germany, 'es_mx' for Spanish in
Mexico).  In there you will find a 'views' directory, and two JSON files.

Under 'views' are several subdirectories containing html files.  English
text in these files should be translated.  Make sure you maintain any html
formatting.  Most of the files have only a few words to translate, except
for help/help-scene.html, which has a page or two of text.  The "licenses"
section of help-scene.html should NOT be translated, since that would alter
the legal meaning of the text.

Aside from the help scene, most of the translation work will be in
lexicon.json.  This file contains strings harvested from the Javascript
code of the application, grouped by the file(s) they are found in.  Most
of the strings need literal translation, but some are descriptions of the
value needing translation.  These strings will have the literal value in
single quotes within the string.  For instance, for the string:
    "'Use import' option for import resolution"
only the literal 'Use import' should be translated; the rest of the text
is there to reduce ambiguity.  Several strings contain variable
interpolations; in the string:
    "Error exporting to #{url}"
"#{url}" will be replaced by the URL the user tried to export to.

Please try to make the translated strings roughly the same length as the
English originals.  Screen space on the phone is limited, and many of the
strings are chosen based on length as much as wording.  It is important to
faithfully copy escaped (backslashed) quotes and newlines. If you want to
check your work, you can run the app in the emulator, and set the language
accordingly (if you don't know how to do this, don't worry about it).  

Ignore strings.json.  It is automatically generated from lexicon.json.


Instructions for developers

I'm still working on the code for `pypalm localize`, so this is TBD...