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

  "'Lock in 10 sec' option for on-deactivate behavior"

only the literal 'Lock in 10 sec' should be translated; the rest of the text
is there to help you understand the meaning of the phrase.  You'll end up with
something like this:

  "'Lock in 10 sec' option for on-deactivate behavior": "In 10 Sekunden sperren",

Several strings contain variable interpolations in the string, like so:

    "Error backing up to #{url}"

When this string is rendered in the app, "#{url}" will be replaced by the
URL the user tried to back up to.  Don't translate the name of the variable.

IMPORTANT: Try hard to make the translated strings roughly the same length
as the English originals.  Screen space on the device is limited, and many of
the strings are chosen based on length as much as meaning.  Some strings have
both a long and a short version, translate them accordingly.  If your language
is verbose (like German), you will need to use abbreviations for some strings.

It is also important to faithfully copy escaped (backslashed) quotes.

Ignore strings.json.  It is automatically generated from lexicon.json.


Testing your translation

Unfortunately this requires rather a lot of setup.  It's probably simplest to
mail the translated files back to the developer.  If you want to do it, you'll
need to generate the strings.json file from lexicon.json using my localizer
code, which can be obtained here:

http://github.com/krid/PyPalm/blob/master/pypalm/lang.py

Run that in the root dir of the app, then run the app in the emulator, setting
the language accordingly.  


Instructions for developers

I'm still working on the code for `pypalm localize`, so this is TBD...