cd "C:\Users\Stefan\Dropbox\PhD\papers\2018.01.15 ProWeb18"
SETLOCAL
SET foo="aexpr-for-jsx"
pdflatex.exe -synctex=1 -interaction=nonstopmode %foo%.tex
bibtex.exe %foo%
pdflatex.exe -synctex=1 -interaction=nonstopmode %foo%.tex
pdflatex.exe -synctex=1 -interaction=nonstopmode %foo%.tex