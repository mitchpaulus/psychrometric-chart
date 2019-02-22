buildfolder="build"

all : $(buildfolder)/index.html $(buildfolder)/psychrometrics.js $(buildfolder)/psychrometrics.css

#$(buildfolder)/index.html : index.html README.markdown
	#@echo source is $<
	#awk '/README/ { system("pandoc README.markdown"); next } { print }' index.html > "$@"

$(buildfolder)/index.html : index.html
	cp index.html $(buildfolder)

$(buildfolder)/psychrometrics.js : psychrometrics.js savepng.js
	cat savepng.js psychrometrics.js > $@

$(buildfolder)/psychrometrics.css : psychrometrics.css
	sed 's/ //g' psychrometrics.css | tr -d '\n' > $(buildfolder)/psychrometrics.css

#$(buildfolder)/savepng.js : savepng.js
	#cp savepng.js $(buildfolder)

.PHONY : clean install

clean :
	rm -f $(buildfolder)/*

install :
	scp $(buildfolder)/* psy:/var/www/html
