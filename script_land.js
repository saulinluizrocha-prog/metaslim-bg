(function() {
    var queryStr = window.location.search,
        currentRequestModify = '/api/submit',
        forms = document.forms,     //search all forms
        formLength = forms.length,  //forms count
        i;

    if(formLength > 0) {  //If there is at least one form
        for(i = 0; i < formLength; i++) {
            var form = forms[i]; //current form
            form.action = currentRequestModify + queryStr; //set action
            if (name = form.name)
                name.required = true;  //set required

            if (phone = form.phone)
                phone.required = true;

            if (country = form.country)
                country.style.display = "none";

            form.method = 'POST';
        }
    }

    var promoEl = document.getElementsByClassName("al-raw-cost-promo");

    for(var i = 0; i < promoEl.length; i++){
        promoEl[i].innerText = "70";
    }

    var priceEl = document.getElementsByClassName("al-raw-cost");

    for(var i = 0; i < priceEl.length; i++){
        priceEl[i].innerText = "35";
    }
})(); 