import Model from "../lib/model";
import { db } from "../db";
import { boarding, daycare, grooming, vet } from "../configs/facilities";
import { keywords } from "../configs/smartSearchKeywords";

export default class extends Model {
  get centersTable() {
    return "centers";
  }

  get offersTable() {
    return "offers";
  }

  //if rating related keyword then distribute rating string and other string eg: "top dog 10" -> ["dog", "10"] ["top"] and turn normal array of string into string and check if rating array of string has length > 0
  hasRatingKeywords(searchString) {
    searchString = searchString.toLowerCase().split(" ");

    let splitSearchString = searchString.filter(
      (x) => keywords.ratingsKeywords.indexOf(x) === -1
    );

    let filteredRatingKeywords = searchString.filter(
      (x) => splitSearchString.indexOf(x) === -1
    );

    searchString = splitSearchString.join(" ");

    return {
      hasKeywords: filteredRatingKeywords.length > 0,
      keywordsExceptRating: searchString.length > 0,
    };
  }

  //getting centers which have ratings
  async getCentersByRating(responseData, params) {
    const ratingsOfCenter = await this.db.raw(
      `select centers.*,avg(rating) as avg_rating from centers join reviews on reviews.center_id = centers.id group by centers.id order by avg_rating DESC;`
    );

    if (!responseData) {
      // console.log("wihtout rating keywords");
      return {
        centers: {
          count: ratingsOfCenter[0].length,
          rows: ratingsOfCenter[0],
        },
        offers: {
          count: 0,
          rows: [],
        },
      };
    }

    //if centers has in the list of ratings
    let filteredCenterByRating = ratingsOfCenter[0].filter((center) =>
      responseData[0].find((data) => {
        if (data.id === center.id) {
          return Object.assign(data, center); //included avg_rating
        }
      })
    );

    const centerIds = filteredCenterByRating.reduce((acc, obj) => {
      acc.push(obj.id);
      return acc;
    }, []);

    const offersData = await this.db.raw(
      `SELECT * FROM ${this.offersTable} WHERE ${
        this.offersTable
      }.center in (${centerIds.join(",")}) LIMIT ${params.limit} OFFSET ${
        params.offset
      }`
    );

    return {
      centers: {
        count: filteredCenterByRating.length,
        rows: filteredCenterByRating,
      },
      offers: {
        count: offersData[0].length,
        rows: offersData[0],
      },
    };
  }

  //(type) arg should be specific to the db column name where column data has json type
  filterKeywords(type, arr) {
    try {
      let filteredData = keywords[type].reduce((acc, obj) => {
        for (const key in obj) {
          arr.filter((word) => {
            if (key === word) {
              acc.push(obj);
            }
          });
        }
        return acc;
      }, []);

      filteredData = new Set(filteredData);
      return Array.from(filteredData);
    } catch (error) {
      return [];
    }
  }

  //generate the sub string of query with specific column name
  makeQueryForSpecificColumn(columnName, columnNameInString) {
    try {
      if (columnName.length > 0) {
        const query = columnName.reduce((acc, curr) => {
          for (const key in curr) {
            acc += `${curr[key]}`;
          }
          return acc.split("").join("|");
        }, "");

        return `AND ${columnNameInString} REGEXP "${query}"`;
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  removeFirstOccuranceWordFromString(str, searchstr) {
    let index = str.indexOf(searchstr);
    if (index === -1) {
      return str;
    }
    return str.slice(0, index) + str.slice(index + searchstr.length);
  }

  //this wil use if user input useless string
  // async fallbackData(params) {
  // 	const fallBackData = await this.db.raw(
  // 		`SELECT * FROM ${this.centersTable} ORDER BY RAND() LIMIT ${params.limit} OFFSET ${params.offset}`
  // 	);

  // 	const centerIds = fallBackData[0].reduce((acc, obj) => {
  // 		acc.push(obj.id);
  // 		return acc;
  // 	}, []);

  // 	const offersData = await this.db.raw(
  // 		`SELECT * FROM ${this.offersTable} WHERE ${
  // 			this.offersTable
  // 		}.center in (${centerIds.join(",")}) LIMIT ${params.limit} OFFSET ${
  // 			params.offset
  // 		}`
  // 	);

  // 	return {
  // 		centers: {
  // 			count: fallBackData[0].length,
  // 			rows: fallBackData[0],
  // 		},
  // 		offers: {
  // 			count: offersData[0].length,
  // 			rows: offersData[0],
  // 		},
  // 	};
  // }

  async getDataAfterSearchingAndJoinOffersData(
    responseData,
    params,
    hasRatingKeywords
  ) {
    //get center ids for getting offers related to center ids
    const centerIds = responseData[0].reduce((acc, obj) => {
      acc.push(obj.id);
      return acc;
    }, []);

    if (hasRatingKeywords) {
      const hasServiceSpecialTag = hasRatingKeywords.slice(-6);

      if (hasServiceSpecialTag === "sbsdkk") {
        return {
          centers: {
            count: null,
            rows: null,
          },
          offers: {
            count: responseData[0].length,
            rows: responseData[0],
          },
        };
      }

      if (hasServiceSpecialTag === "sbsdll") {
        return {
          centers: {
            count: responseData[0].length,
            rows: responseData[0],
          },
          offers: {
            count: null,
            rows: null,
          },
        };
      }
    }

    try {
      const offersData = await this.db.raw(
        `SELECT * FROM ${this.offersTable} WHERE ${
          this.offersTable
        }.center in (${centerIds.join(",")}) LIMIT ${params.limit} OFFSET ${
          params.offset
        }`
      );

      if (hasRatingKeywords) {
        return await this.getCentersByRating(responseData, params);
      }

      return {
        centers: {
          count: responseData[0].length,
          rows: responseData[0],
        },
        offers: {
          count: offersData[0].length,
          rows: offersData[0],
        },
      };
    } catch (error) {
      //intentionally leave
    }
    return false;
  }

  facilitiesNameLowercase(serviceType) {
    return serviceType.map((obj) => {
      return {
        ...obj,
        name: obj.name.toLowerCase(), //override the name values into lower case
      };
    });
  }

  findSearchStringInFacilities(facilities, searchString) {
    const [id] = facilities
      .filter((obj) => obj.name.includes(searchString))
      .map((obj) => obj.id);

    // const [id] = facilities
    //   .filter((obj) => {
    //     console.log(obj.name.includes(searchString));
    //     obj.name.includes(searchString);
    //   })
    //   .map((obj) => {
    //     obj.id;
    //   });

    // console.log(id);

    return id;
  }

  facilitiesHelperFindById(facilityType, searchString) {
    const boardingObj = this.facilitiesNameLowercase(facilityType);
    const daycareObj = this.facilitiesNameLowercase(facilityType);
    const groomingObj = this.facilitiesNameLowercase(facilityType);
    const vetObj = this.facilitiesNameLowercase(facilityType);

    // console.log(boardingObj, daycareObj, groomingObj, vetObj);

    return {
      bfID: this.findSearchStringInFacilities(boardingObj, searchString),
      dfID: this.findSearchStringInFacilities(daycareObj, searchString),
      gfID: this.findSearchStringInFacilities(groomingObj, searchString),
      vfID: this.findSearchStringInFacilities(vetObj, searchString),
    };
  }

  //will return false if words exeeded
  maxWordLengthInString(searchString, wordsLength) {
    searchString = searchString.toLowerCase().split(" ");
    return searchString.length <= wordsLength && searchString.join(" ");
  }

  //this function only run when user will enter string which is related to center facilities
  //user must have only one word or same string as facilities
  async searchByFacilities(searchString, params) {
    // searchString = this.maxWordLengthInString(searchString, 8);

    if (!searchString) {
      return false;
    }

    searchString = searchString.split(" ");
    const facilityKeyword = searchString[0];
    const boardingKeyword = searchString[searchString.length - 2];

    console.log(boardingKeyword);

    // console.log(10, facilityFirstKeyword);

    let query = `SELECT * FROM centers WHERE`;

    const bfID = this.facilitiesHelperFindById(boarding, facilityKeyword).bfID;
    const dfID = this.facilitiesHelperFindById(daycare, facilityKeyword).dfID;
    const gfID = this.facilitiesHelperFindById(grooming, facilityKeyword).gfID;
    const vfID = this.facilitiesHelperFindById(vet, facilityKeyword).vfID;

    // console.log(bfID, dfID, gfID, vfID);

    if (boardingKeyword.includes("boarding")) {
      bfID && (query += ` boarding_filters REGEXP "${bfID}" AND`);
    } else if (boardingKeyword.includes("grooming")) {
      gfID && (query += ` groming_filters REGEXP "${gfID}" AND`);
    } else if (boardingKeyword.includes("daycare")) {
      dfID && (query += ` daycare_filters REGEXP "${dfID}" AND`);
    } else if (boardingKeyword.includes("vet")) {
      vfID && (query += ` vet_filters REGEXP "${vfID}" AND`);
    }

    query = query.substring(0, query.length - 3); //remove last space and AND from the query
    query = `${query} LIMIT ${params.limit} OFFSET ${params.offset}`;

    // console.log(1, query);

    if (bfID || gfID || dfID || vfID) {
      // console.log("bfID || gfID || dfID || vfID");
      return await this.db.raw(query);
    }

    return [];
  }

  async searchByService(keyWords, params) {
    const finalKeyWords = keyWords.join(" ");

    let query = await this.db
      .raw(
        `SELECT * FROM ${this.offersTable} WHERE name REGEXP "${finalKeyWords}" OR description REGEXP "${finalKeyWords}" LIMIT ${params.limit} OFFSET ${params.offset}`
      )
      .toString();

    // console.log(5, query);

    const responseData = await this.db.raw(query);

    return await this.getDataAfterSearchingAndJoinOffersData(
      responseData,
      params,
      `${finalKeyWords} sbsdkk` //sbsdkk for identify the string for search by service
    );
  }

  async searchByCenter(keyWords, params) {
    const finalKeyWords = keyWords.join(" ");

    // console.log(10, finalKeyWords);

    let query = await this.db
      .raw(
        `SELECT * FROM ${this.centersTable} WHERE property_name REGEXP "${finalKeyWords}" OR description REGEXP "${finalKeyWords}" LIMIT ${params.limit} OFFSET ${params.offset}`
      )
      .toString();

    // console.log(6, query);

    const responseData = await this.db.raw(query);

    //for prioritizing the property_name column
    const t = responseData[0].reduce((acc, o) => {
      const regexString = `^${finalKeyWords}`;
      const regexp = new RegExp(regexString, "i"); //match begining letters with insensitive case

      if (regexp.test(o.property_name.toLowerCase())) {
        acc.push(o);
      }

      return acc;
    }, []);

    let _responseData = new Set([...t, ...responseData[0]]);

    // [[..._responseData]] made nested due to requirement of fuction where it would be pass
    _responseData = [[..._responseData]];

    return await this.getDataAfterSearchingAndJoinOffersData(
      _responseData,
      params,
      `${finalKeyWords} sbsdll` //sbsdll for identify the string for search by service
    );
  }

  //params -> limit and offset logic in getDataAfterSearchingAndJoinOffersData(arg1, params)
  async smartSearch(searchString, params) {
    let responseData = null;
    searchString = searchString.trim();

    searchString = this.maxWordLengthInString(searchString, 8);

    const ss = searchString.split(" ");

    const lastKeyWord = ss.pop(); //remove tag

    ss.pop(); // remove last occurence (in)

    if (lastKeyWord === "service") {
      return await this.searchByService(ss, params);
    }

    if (lastKeyWord === "center") {
      searchString = ss.join(" ");
      // console.log(searchString);
      //for specific two words in a string suppose to be specific
      const words = searchString.toLowerCase().split(" ");

      let pets = this.filterKeywords("pet_type", words);
      let services = this.filterKeywords("b_type", words);
      let petSize = this.filterKeywords("size", words);
      let cities = this.filterKeywords("city", words);

      // console.log(pets, services, petSize, cities);

      const isStringHasNumber = /[0-9]/.test(words); //check if string has a number characters

      //if string starts with rating keywords only not the combination of other words
      if (!this.hasRatingKeywords(searchString).keywordsExceptRating) {
        return await this.getCentersByRating(false, false);
      }

      if (isStringHasNumber) {
        const number = searchString.split("");

        //take a number char from string and parsed into number
        const parsedNumber = number
          .filter((num) => +num >= 0 && num !== " ") //remove all white spaces
          .map((parseNum) => +parseNum)
          .join("");

        const petQuery = this.makeQueryForSpecificColumn(pets, "pet_type");
        const serviceQuery = this.makeQueryForSpecificColumn(
          services,
          "b_type"
        );
        const petSizeQuery = this.makeQueryForSpecificColumn(petSize, "size");
        const cityQuery = this.makeQueryForSpecificColumn(cities, "city");

        const makeRegexQuery = `${petQuery} ${serviceQuery} ${petSizeQuery} ${cityQuery}`;

        const findAndReplace = makeRegexQuery.replace(
          new RegExp("OR", "g"),
          "AND"
        );

        // console.log(2, findAndReplace);

        const responseData = await this.db.raw(
          `SELECT * FROM centers WHERE minOfferPrice <= ${+parsedNumber} ${findAndReplace} ORDER BY centers.minOfferPrice DESC LIMIT ${
            params.limit
          } OFFSET ${params.offset}`
        );

        return await this.getDataAfterSearchingAndJoinOffersData(
          responseData,
          params,
          this.hasRatingKeywords(searchString).hasKeywords
        );
      }

      //if user type related to pet, services, pet size and cities
      if (
        pets.length > 0 ||
        services.length > 0 ||
        petSize.length > 0 ||
        cities.length > 0
      ) {
        let query = this.db
          .raw(
            `SELECT * FROM ${
              this.centersTable
            } WHERE ${this.makeQueryForSpecificColumn(
              pets,
              "pet_type"
            )} ${this.makeQueryForSpecificColumn(
              services,
              "b_type"
            )} ${this.makeQueryForSpecificColumn(
              petSize,
              "size"
            )} ${this.makeQueryForSpecificColumn(cities, "city")}`
          )
          .toString();

        query = this.removeFirstOccuranceWordFromString(query, "AND");

        query = `${query} LIMIT ${params.limit} OFFSET ${params.offset}`;

        // console.log(3, query);

        const responseData = await this.db.raw(query);

        return await this.getDataAfterSearchingAndJoinOffersData(
          responseData,
          params,
          this.hasRatingKeywords(searchString).hasKeywords
        );
      } else {
        return await this.searchByCenter(ss, params);
      }
    }

    if (lastKeyWord === "facilities") {
      try {
        responseData = await this.searchByFacilities(searchString, params);

        // console.log(responseData);

        return await this.getDataAfterSearchingAndJoinOffersData(
          responseData,
          params,
          this.hasRatingKeywords(searchString).hasKeywords
        );
      } catch (error) {
        if (!responseData || !searchString) {
          throw new Error("Max word limit exeeded!");
        }
      }
    }
  }
}
