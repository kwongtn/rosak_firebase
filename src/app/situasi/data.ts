export interface LinesVehiclesStationData {
    id: string;
    code: string;
    displayName: string;
    vehicles: {
        id: string;
        identificationNo: string;
    }[];
    stations: {
        id: string;
        displayName: string;
    }[];
}

export const data: LinesVehiclesStationData[] = [
    {
        id: "15",
        code: "BRT SBL",
        displayName: "BRT Sunway Line",
        vehicles: [
            {
                id: "546",
                identificationNo: "BNG4101",
            },
            {
                id: "547",
                identificationNo: "BNG4103",
            },
            {
                id: "548",
                identificationNo: "BNG4105",
            },
            {
                id: "549",
                identificationNo: "BNG4106",
            },
            {
                id: "550",
                identificationNo: "BNG4107",
            },
            {
                id: "551",
                identificationNo: "BNG4110",
            },
            {
                id: "552",
                identificationNo: "BNG4015",
            },
            {
                id: "553",
                identificationNo: "BNG4204",
            },
            {
                id: "554",
                identificationNo: "BNG4113",
            },
            {
                id: "555",
                identificationNo: "BNG4108",
            },
            {
                id: "556",
                identificationNo: "BNG4111",
            },
            {
                id: "557",
                identificationNo: "BNG4109",
            },
            {
                id: "558",
                identificationNo: "BNG4102",
            },
            {
                id: "563",
                identificationNo: "BNG4014",
            },
        ],
        stations: [
            {
                id: "204",
                displayName: "Mentari",
            },
            {
                id: "135",
                displayName: "Setia Jaya",
            },
            {
                id: "208",
                displayName: "South Quay-USJ1",
            },
            {
                id: "207",
                displayName: "SunU-Monash",
            },
            {
                id: "206",
                displayName: "Sunmed",
            },
            {
                id: "205",
                displayName: "Sunway Lagoon",
            },
            {
                id: "79",
                displayName: "USJ7",
            },
        ],
    },
    {
        id: "8",
        code: "ERL",
        displayName: "ERL (Express Rail Link) - KLIA Transit & Express",
        vehicles: [
            {
                id: "288",
                identificationNo: "X1-06",
            },
            {
                id: "289",
                identificationNo: "X1-07",
            },
            {
                id: "290",
                identificationNo: "X1-08",
            },
            {
                id: "291",
                identificationNo: "T2-05",
            },
            {
                id: "292",
                identificationNo: "T2-06",
            },
            {
                id: "293",
                identificationNo: "T2-07",
            },
            {
                id: "294",
                identificationNo: "T2-08",
            },
            {
                id: "295",
                identificationNo: "X2-09",
            },
            {
                id: "296",
                identificationNo: "X2-10",
            },
            {
                id: "279",
                identificationNo: "T1-01",
            },
            {
                id: "280",
                identificationNo: "T1-02",
            },
            {
                id: "281",
                identificationNo: "T1-03",
            },
            {
                id: "282",
                identificationNo: "T1-04",
            },
            {
                id: "283",
                identificationNo: "X1-01",
            },
            {
                id: "284",
                identificationNo: "X1-02",
            },
            {
                id: "285",
                identificationNo: "X1-03",
            },
            {
                id: "286",
                identificationNo: "X1-04",
            },
            {
                id: "287",
                identificationNo: "X1-05",
            },
        ],
        stations: [
            {
                id: "102",
                displayName: "Bandar Tasik Selatan",
            },
            {
                id: "1",
                displayName: "KL Sentral",
            },
            {
                id: "168",
                displayName: "Kuala Lumpur International Airport",
            },
            {
                id: "169",
                displayName: "Kuala Lumpur International Airport 2",
            },
            {
                id: "166",
                displayName: "Putrajaya Sentral",
            },
            {
                id: "167",
                displayName: "Salak Tinggi",
            },
        ],
    },
    {
        id: "10",
        code: "KTM ETS",
        displayName: "KTM Electric Train Service",
        vehicles: [
            {
                id: "397",
                identificationNo: "ETS 101",
            },
            {
                id: "398",
                identificationNo: "ETS 102",
            },
            {
                id: "399",
                identificationNo: "ETS 103",
            },
            {
                id: "400",
                identificationNo: "ETS 104",
            },
            {
                id: "401",
                identificationNo: "ETS 105",
            },
            {
                id: "402",
                identificationNo: "ETS 201",
            },
            {
                id: "403",
                identificationNo: "ETS 202",
            },
            {
                id: "404",
                identificationNo: "ETS 203",
            },
            {
                id: "405",
                identificationNo: "ETS 204",
            },
            {
                id: "406",
                identificationNo: "ETS 205",
            },
            {
                id: "407",
                identificationNo: "ETS 206",
            },
            {
                id: "408",
                identificationNo: "ETS 207",
            },
            {
                id: "409",
                identificationNo: "ETS 208",
            },
            {
                id: "410",
                identificationNo: "ETS 209",
            },
            {
                id: "411",
                identificationNo: "ETS 210",
            },
            {
                id: "412",
                identificationNo: "ETS 211",
            },
            {
                id: "413",
                identificationNo: "ETS 212",
            },
            {
                id: "414",
                identificationNo: "ETS 213",
            },
            {
                id: "415",
                identificationNo: "ETS 214",
            },
            {
                id: "416",
                identificationNo: "ETS 215",
            },
            {
                id: "417",
                identificationNo: "ETS 216",
            },
            {
                id: "418",
                identificationNo: "ETS 217",
            },
            {
                id: "419",
                identificationNo: "ETS 218",
            },
            {
                id: "420",
                identificationNo: "ETS 219",
            },
            {
                id: "421",
                identificationNo: "DMU 01",
            },
            {
                id: "422",
                identificationNo: "DMU 02",
            },
            {
                id: "423",
                identificationNo: "DMU 03",
            },
            {
                id: "424",
                identificationNo: "DMU 04",
            },
            {
                id: "425",
                identificationNo: "DMU 05",
            },
            {
                id: "426",
                identificationNo: "DMU 06",
            },
            {
                id: "427",
                identificationNo: "DMU 07",
            },
            {
                id: "428",
                identificationNo: "DMU 08",
            },
            {
                id: "429",
                identificationNo: "DMU 09",
            },
            {
                id: "430",
                identificationNo: "DMU 10",
            },
            {
                id: "431",
                identificationNo: "DMU 11",
            },
            {
                id: "432",
                identificationNo: "DMU 12",
            },
            {
                id: "433",
                identificationNo: "DMU 13",
            },
        ],
        stations: [
            {
                id: "179",
                displayName: "Alor Setar",
            },
            {
                id: "180",
                displayName: "Anak Bukit",
            },
            {
                id: "182",
                displayName: "Arau",
            },
            {
                id: "188",
                displayName: "Bagan Serai",
            },
            {
                id: "102",
                displayName: "Bandar Tasik Selatan",
            },
            {
                id: "119",
                displayName: "Batang Kali",
            },
            {
                id: "200",
                displayName: "Batang Melaka",
            },
            {
                id: "195",
                displayName: "Batu Gajah",
            },
            {
                id: "199",
                displayName: "Behrang",
            },
            {
                id: "174",
                displayName: "Bukit Mertajam",
            },
            {
                id: "172",
                displayName: "Butterworth",
            },
            {
                id: "201",
                displayName: "Gemas",
            },
            {
                id: "177",
                displayName: "Gurun",
            },
            {
                id: "194",
                displayName: "Ipoh",
            },
            {
                id: "1",
                displayName: "KL Sentral",
            },
            {
                id: "38",
                displayName: "Kajang",
            },
            {
                id: "196",
                displayName: "Kampar",
            },
            {
                id: "123",
                displayName: "Kepong Sentral",
            },
            {
                id: "192",
                displayName: "Kuala Kangsar",
            },
            {
                id: "117",
                displayName: "Kuala Kubu Bharu",
            },
            {
                id: "128",
                displayName: "Kuala Lumpur",
            },
            {
                id: "184",
                displayName: "Padang Besar",
            },
            {
                id: "191",
                displayName: "Padang Rengas",
            },
            {
                id: "187",
                displayName: "Parit Buntar",
            },
            {
                id: "165",
                displayName: "Pulau Sebang",
            },
            {
                id: "121",
                displayName: "Rawang",
            },
            {
                id: "161",
                displayName: "Seremban",
            },
            {
                id: "198",
                displayName: "Slim River",
            },
            {
                id: "40",
                displayName: "Sungai Buloh",
            },
            {
                id: "176",
                displayName: "Sungai Petani",
            },
            {
                id: "193",
                displayName: "Sungai Siput",
            },
            {
                id: "197",
                displayName: "Sungkai",
            },
            {
                id: "190",
                displayName: "Taiping",
            },
            {
                id: "116",
                displayName: "Tanjung Malim",
            },
            {
                id: "203",
                displayName: "Tapah Road",
            },
            {
                id: "202",
                displayName: "Tasek",
            },
            {
                id: "175",
                displayName: "Tasek Gelugor",
            },
        ],
    },
    {
        id: "12",
        code: "KTMB Loco",
        displayName: "KTM Locomotive",
        vehicles: [
            {
                id: "512",
                identificationNo: "29101",
            },
            {
                id: "513",
                identificationNo: "29102",
            },
            {
                id: "514",
                identificationNo: "29103",
            },
            {
                id: "515",
                identificationNo: "29104",
            },
            {
                id: "516",
                identificationNo: "29105",
            },
            {
                id: "517",
                identificationNo: "29106",
            },
            {
                id: "518",
                identificationNo: "29107",
            },
            {
                id: "519",
                identificationNo: "29108",
            },
            {
                id: "520",
                identificationNo: "29109",
            },
            {
                id: "521",
                identificationNo: "29110",
            },
            {
                id: "522",
                identificationNo: "29111",
            },
            {
                id: "523",
                identificationNo: "29112",
            },
            {
                id: "524",
                identificationNo: "29113",
            },
            {
                id: "525",
                identificationNo: "29114",
            },
            {
                id: "526",
                identificationNo: "29115",
            },
            {
                id: "527",
                identificationNo: "29116",
            },
            {
                id: "528",
                identificationNo: "29117",
            },
            {
                id: "529",
                identificationNo: "29118",
            },
            {
                id: "530",
                identificationNo: "29119",
            },
            {
                id: "531",
                identificationNo: "29120",
            },
            {
                id: "532",
                identificationNo: "19101",
            },
            {
                id: "533",
                identificationNo: "19102",
            },
            {
                id: "534",
                identificationNo: "19103",
            },
            {
                id: "535",
                identificationNo: "19104",
            },
            {
                id: "536",
                identificationNo: "19105",
            },
            {
                id: "537",
                identificationNo: "19106",
            },
            {
                id: "538",
                identificationNo: "19107",
            },
            {
                id: "539",
                identificationNo: "19108",
            },
            {
                id: "540",
                identificationNo: "19109",
            },
            {
                id: "541",
                identificationNo: "19110",
            },
            {
                id: "434",
                identificationNo: "23101",
            },
            {
                id: "435",
                identificationNo: "23102",
            },
            {
                id: "436",
                identificationNo: "23103",
            },
            {
                id: "437",
                identificationNo: "23104",
            },
            {
                id: "438",
                identificationNo: "23105",
            },
            {
                id: "439",
                identificationNo: "23106",
            },
            {
                id: "440",
                identificationNo: "23107",
            },
            {
                id: "441",
                identificationNo: "23108",
            },
            {
                id: "442",
                identificationNo: "23109",
            },
            {
                id: "443",
                identificationNo: "23110",
            },
            {
                id: "444",
                identificationNo: "23111",
            },
            {
                id: "445",
                identificationNo: "23112",
            },
            {
                id: "446",
                identificationNo: "23113",
            },
            {
                id: "447",
                identificationNo: "23114",
            },
            {
                id: "448",
                identificationNo: "23115",
            },
            {
                id: "449",
                identificationNo: "24101",
            },
            {
                id: "450",
                identificationNo: "24102",
            },
            {
                id: "451",
                identificationNo: "24103",
            },
            {
                id: "452",
                identificationNo: "24104",
            },
            {
                id: "453",
                identificationNo: "24105",
            },
            {
                id: "454",
                identificationNo: "24106",
            },
            {
                id: "455",
                identificationNo: "24107",
            },
            {
                id: "456",
                identificationNo: "24108",
            },
            {
                id: "457",
                identificationNo: "24109",
            },
            {
                id: "458",
                identificationNo: "24110",
            },
            {
                id: "459",
                identificationNo: "24111",
            },
            {
                id: "460",
                identificationNo: "24112",
            },
            {
                id: "461",
                identificationNo: "24113",
            },
            {
                id: "462",
                identificationNo: "24114",
            },
            {
                id: "463",
                identificationNo: "24115",
            },
            {
                id: "464",
                identificationNo: "24116",
            },
            {
                id: "465",
                identificationNo: "24117",
            },
            {
                id: "466",
                identificationNo: "24118",
            },
            {
                id: "467",
                identificationNo: "24119",
            },
            {
                id: "468",
                identificationNo: "24120",
            },
            {
                id: "469",
                identificationNo: "24121",
            },
            {
                id: "470",
                identificationNo: "24122",
            },
            {
                id: "471",
                identificationNo: "24123",
            },
            {
                id: "472",
                identificationNo: "24124",
            },
            {
                id: "473",
                identificationNo: "24125",
            },
            {
                id: "474",
                identificationNo: "24126",
            },
            {
                id: "475",
                identificationNo: "25101",
            },
            {
                id: "476",
                identificationNo: "25102",
            },
            {
                id: "477",
                identificationNo: "25103",
            },
            {
                id: "478",
                identificationNo: "25104",
            },
            {
                id: "479",
                identificationNo: "25105",
            },
            {
                id: "480",
                identificationNo: "25106",
            },
            {
                id: "481",
                identificationNo: "25107",
            },
            {
                id: "482",
                identificationNo: "25108",
            },
            {
                id: "483",
                identificationNo: "25109",
            },
            {
                id: "484",
                identificationNo: "25110",
            },
            {
                id: "485",
                identificationNo: "25111",
            },
            {
                id: "486",
                identificationNo: "25112",
            },
            {
                id: "487",
                identificationNo: "25201",
            },
            {
                id: "488",
                identificationNo: "25202",
            },
            {
                id: "489",
                identificationNo: "25203",
            },
            {
                id: "490",
                identificationNo: "25204",
            },
            {
                id: "491",
                identificationNo: "25205",
            },
            {
                id: "492",
                identificationNo: "26101",
            },
            {
                id: "493",
                identificationNo: "26102",
            },
            {
                id: "494",
                identificationNo: "26103",
            },
            {
                id: "495",
                identificationNo: "26104",
            },
            {
                id: "496",
                identificationNo: "26105",
            },
            {
                id: "497",
                identificationNo: "26106",
            },
            {
                id: "498",
                identificationNo: "26107",
            },
            {
                id: "499",
                identificationNo: "26108",
            },
            {
                id: "500",
                identificationNo: "26109",
            },
            {
                id: "501",
                identificationNo: "26110",
            },
            {
                id: "502",
                identificationNo: "26111",
            },
            {
                id: "503",
                identificationNo: "26112",
            },
            {
                id: "504",
                identificationNo: "26113",
            },
            {
                id: "505",
                identificationNo: "26114",
            },
            {
                id: "506",
                identificationNo: "26115",
            },
            {
                id: "507",
                identificationNo: "26116",
            },
            {
                id: "508",
                identificationNo: "26117",
            },
            {
                id: "509",
                identificationNo: "26118",
            },
            {
                id: "510",
                identificationNo: "26119",
            },
            {
                id: "511",
                identificationNo: "26120",
            },
        ],
        stations: [],
    },
    {
        id: "13",
        code: "KTMK-PBL",
        displayName: "KTM Komuter - Padang Besar Line",
        vehicles: [
            {
                id: "315",
                identificationNo: "EMU19",
            },
            {
                id: "316",
                identificationNo: "EMU20",
            },
            {
                id: "317",
                identificationNo: "EMU21",
            },
            {
                id: "318",
                identificationNo: "EMU22",
            },
            {
                id: "319",
                identificationNo: "EMU23",
            },
            {
                id: "320",
                identificationNo: "EMU24",
            },
            {
                id: "321",
                identificationNo: "EMU25",
            },
            {
                id: "322",
                identificationNo: "EMU26",
            },
            {
                id: "323",
                identificationNo: "EMU27",
            },
            {
                id: "324",
                identificationNo: "EMU28",
            },
            {
                id: "325",
                identificationNo: "EMU29",
            },
            {
                id: "326",
                identificationNo: "EMU30",
            },
            {
                id: "327",
                identificationNo: "EMU31",
            },
            {
                id: "328",
                identificationNo: "EMU32",
            },
            {
                id: "329",
                identificationNo: "EMU33",
            },
            {
                id: "330",
                identificationNo: "EMU34",
            },
            {
                id: "331",
                identificationNo: "EMU35",
            },
            {
                id: "332",
                identificationNo: "EMU36",
            },
            {
                id: "333",
                identificationNo: "EMU37",
            },
            {
                id: "334",
                identificationNo: "EMU38",
            },
            {
                id: "335",
                identificationNo: "EMU39",
            },
            {
                id: "336",
                identificationNo: "EMU40",
            },
            {
                id: "337",
                identificationNo: "SCS01",
            },
            {
                id: "338",
                identificationNo: "SCS02",
            },
            {
                id: "339",
                identificationNo: "SCS03",
            },
            {
                id: "340",
                identificationNo: "SCS04",
            },
            {
                id: "341",
                identificationNo: "SCS05",
            },
            {
                id: "342",
                identificationNo: "SCS06",
            },
            {
                id: "343",
                identificationNo: "SCS07",
            },
            {
                id: "344",
                identificationNo: "SCS08",
            },
            {
                id: "345",
                identificationNo: "SCS09",
            },
            {
                id: "346",
                identificationNo: "SCS10",
            },
            {
                id: "347",
                identificationNo: "SCS11",
            },
            {
                id: "348",
                identificationNo: "SCS12",
            },
            {
                id: "349",
                identificationNo: "SCS13",
            },
            {
                id: "350",
                identificationNo: "SCS14",
            },
            {
                id: "351",
                identificationNo: "SCS15",
            },
            {
                id: "352",
                identificationNo: "SCS16",
            },
            {
                id: "353",
                identificationNo: "SCS17",
            },
            {
                id: "354",
                identificationNo: "SCS18",
            },
            {
                id: "355",
                identificationNo: "SCS19",
            },
            {
                id: "356",
                identificationNo: "SCS20",
            },
            {
                id: "357",
                identificationNo: "SCS21",
            },
            {
                id: "358",
                identificationNo: "SCS22",
            },
            {
                id: "359",
                identificationNo: "SCS23",
            },
            {
                id: "360",
                identificationNo: "SCS24",
            },
            {
                id: "361",
                identificationNo: "SCS25",
            },
            {
                id: "362",
                identificationNo: "SCS26",
            },
            {
                id: "363",
                identificationNo: "SCS27",
            },
            {
                id: "364",
                identificationNo: "SCS28",
            },
            {
                id: "365",
                identificationNo: "SCS29",
            },
            {
                id: "366",
                identificationNo: "SCS30",
            },
            {
                id: "367",
                identificationNo: "SCS31",
            },
            {
                id: "368",
                identificationNo: "SCS32",
            },
            {
                id: "369",
                identificationNo: "SCS33",
            },
            {
                id: "370",
                identificationNo: "SCS34",
            },
            {
                id: "371",
                identificationNo: "SCS35",
            },
            {
                id: "372",
                identificationNo: "SCS36",
            },
            {
                id: "373",
                identificationNo: "SCS37",
            },
            {
                id: "374",
                identificationNo: "SCS38",
            },
        ],
        stations: [
            {
                id: "179",
                displayName: "Alor Setar",
            },
            {
                id: "180",
                displayName: "Anak Bukit",
            },
            {
                id: "182",
                displayName: "Arau",
            },
            {
                id: "183",
                displayName: "Bukit Ketri",
            },
            {
                id: "174",
                displayName: "Bukit Mertajam",
            },
            {
                id: "173",
                displayName: "Bukit Tengah",
            },
            {
                id: "172",
                displayName: "Butterworth",
            },
            {
                id: "177",
                displayName: "Gurun",
            },
            {
                id: "178",
                displayName: "Kobah",
            },
            {
                id: "181",
                displayName: "Kodiang",
            },
            {
                id: "184",
                displayName: "Padang Besar",
            },
            {
                id: "176",
                displayName: "Sungai Petani",
            },
            {
                id: "175",
                displayName: "Tasek Gelugor",
            },
        ],
    },
    {
        id: "6",
        code: "KTMK-PKL",
        displayName: "KTM Komuter - Port Klang Line",
        vehicles: [
            {
                id: "297",
                identificationNo: "EMU01",
            },
            {
                id: "298",
                identificationNo: "EMU02",
            },
            {
                id: "299",
                identificationNo: "EMU03",
            },
            {
                id: "300",
                identificationNo: "EMU04",
            },
            {
                id: "301",
                identificationNo: "EMU05",
            },
            {
                id: "302",
                identificationNo: "EMU06",
            },
            {
                id: "303",
                identificationNo: "EMU07",
            },
            {
                id: "304",
                identificationNo: "EMU08",
            },
            {
                id: "305",
                identificationNo: "EMU09",
            },
            {
                id: "306",
                identificationNo: "EMU10",
            },
            {
                id: "307",
                identificationNo: "EMU11",
            },
            {
                id: "308",
                identificationNo: "EMU12",
            },
            {
                id: "309",
                identificationNo: "EMU13",
            },
            {
                id: "310",
                identificationNo: "EMU14",
            },
            {
                id: "311",
                identificationNo: "EMU15",
            },
            {
                id: "312",
                identificationNo: "EMU16",
            },
            {
                id: "313",
                identificationNo: "EMU17",
            },
            {
                id: "314",
                identificationNo: "EMU18",
            },
            {
                id: "315",
                identificationNo: "EMU19",
            },
            {
                id: "316",
                identificationNo: "EMU20",
            },
            {
                id: "317",
                identificationNo: "EMU21",
            },
            {
                id: "318",
                identificationNo: "EMU22",
            },
            {
                id: "319",
                identificationNo: "EMU23",
            },
            {
                id: "320",
                identificationNo: "EMU24",
            },
            {
                id: "321",
                identificationNo: "EMU25",
            },
            {
                id: "322",
                identificationNo: "EMU26",
            },
            {
                id: "323",
                identificationNo: "EMU27",
            },
            {
                id: "324",
                identificationNo: "EMU28",
            },
            {
                id: "325",
                identificationNo: "EMU29",
            },
            {
                id: "326",
                identificationNo: "EMU30",
            },
            {
                id: "327",
                identificationNo: "EMU31",
            },
            {
                id: "328",
                identificationNo: "EMU32",
            },
            {
                id: "329",
                identificationNo: "EMU33",
            },
            {
                id: "330",
                identificationNo: "EMU34",
            },
            {
                id: "331",
                identificationNo: "EMU35",
            },
            {
                id: "332",
                identificationNo: "EMU36",
            },
            {
                id: "333",
                identificationNo: "EMU37",
            },
            {
                id: "334",
                identificationNo: "EMU38",
            },
            {
                id: "335",
                identificationNo: "EMU39",
            },
            {
                id: "336",
                identificationNo: "EMU40",
            },
            {
                id: "337",
                identificationNo: "SCS01",
            },
            {
                id: "338",
                identificationNo: "SCS02",
            },
            {
                id: "339",
                identificationNo: "SCS03",
            },
            {
                id: "340",
                identificationNo: "SCS04",
            },
            {
                id: "341",
                identificationNo: "SCS05",
            },
            {
                id: "342",
                identificationNo: "SCS06",
            },
            {
                id: "343",
                identificationNo: "SCS07",
            },
            {
                id: "344",
                identificationNo: "SCS08",
            },
            {
                id: "345",
                identificationNo: "SCS09",
            },
            {
                id: "346",
                identificationNo: "SCS10",
            },
            {
                id: "347",
                identificationNo: "SCS11",
            },
            {
                id: "348",
                identificationNo: "SCS12",
            },
            {
                id: "349",
                identificationNo: "SCS13",
            },
            {
                id: "350",
                identificationNo: "SCS14",
            },
            {
                id: "351",
                identificationNo: "SCS15",
            },
            {
                id: "352",
                identificationNo: "SCS16",
            },
            {
                id: "353",
                identificationNo: "SCS17",
            },
            {
                id: "354",
                identificationNo: "SCS18",
            },
            {
                id: "355",
                identificationNo: "SCS19",
            },
            {
                id: "356",
                identificationNo: "SCS20",
            },
            {
                id: "357",
                identificationNo: "SCS21",
            },
            {
                id: "358",
                identificationNo: "SCS22",
            },
            {
                id: "359",
                identificationNo: "SCS23",
            },
            {
                id: "360",
                identificationNo: "SCS24",
            },
            {
                id: "361",
                identificationNo: "SCS25",
            },
            {
                id: "362",
                identificationNo: "SCS26",
            },
            {
                id: "363",
                identificationNo: "SCS27",
            },
            {
                id: "364",
                identificationNo: "SCS28",
            },
            {
                id: "365",
                identificationNo: "SCS29",
            },
            {
                id: "366",
                identificationNo: "SCS30",
            },
            {
                id: "367",
                identificationNo: "SCS31",
            },
            {
                id: "368",
                identificationNo: "SCS32",
            },
            {
                id: "369",
                identificationNo: "SCS33",
            },
            {
                id: "370",
                identificationNo: "SCS34",
            },
            {
                id: "371",
                identificationNo: "SCS35",
            },
            {
                id: "372",
                identificationNo: "SCS36",
            },
            {
                id: "373",
                identificationNo: "SCS37",
            },
            {
                id: "374",
                identificationNo: "SCS38",
            },
            {
                id: "375",
                identificationNo: "EMU41",
            },
            {
                id: "376",
                identificationNo: "EMU42",
            },
            {
                id: "377",
                identificationNo: "EMU43",
            },
            {
                id: "378",
                identificationNo: "EMU44",
            },
            {
                id: "379",
                identificationNo: "EMU45",
            },
            {
                id: "380",
                identificationNo: "EMU46",
            },
            {
                id: "381",
                identificationNo: "EMU47",
            },
            {
                id: "382",
                identificationNo: "EMU48",
            },
            {
                id: "383",
                identificationNo: "EMU49",
            },
            {
                id: "384",
                identificationNo: "EMU50",
            },
            {
                id: "385",
                identificationNo: "EMU51",
            },
            {
                id: "386",
                identificationNo: "EMU52",
            },
            {
                id: "387",
                identificationNo: "EMU53",
            },
            {
                id: "388",
                identificationNo: "EMU54",
            },
            {
                id: "389",
                identificationNo: "EMU55",
            },
            {
                id: "390",
                identificationNo: "EMU56",
            },
            {
                id: "391",
                identificationNo: "EMU57",
            },
            {
                id: "392",
                identificationNo: "EMU58",
            },
            {
                id: "393",
                identificationNo: "EMU59",
            },
            {
                id: "394",
                identificationNo: "EMU60",
            },
            {
                id: "395",
                identificationNo: "EMU61",
            },
            {
                id: "396",
                identificationNo: "EMU62",
            },
        ],
        stations: [
            {
                id: "65",
                displayName: "Abdullah Hukum",
            },
            {
                id: "129",
                displayName: "Angkasapuri",
            },
            {
                id: "127",
                displayName: "Bank Negara",
            },
            {
                id: "119",
                displayName: "Batang Kali",
            },
            {
                id: "137",
                displayName: "Batu Tiga",
            },
            {
                id: "140",
                displayName: "Bukit Badak",
            },
            {
                id: "145",
                displayName: "Jalan Kastam",
            },
            {
                id: "132",
                displayName: "Jalan Templer",
            },
            {
                id: "1",
                displayName: "KL Sentral",
            },
            {
                id: "133",
                displayName: "Kampung Dato Harun",
            },
            {
                id: "144",
                displayName: "Kampung Raja Uda",
            },
            {
                id: "124",
                displayName: "Kepong",
            },
            {
                id: "123",
                displayName: "Kepong Sentral",
            },
            {
                id: "141",
                displayName: "Klang",
            },
            {
                id: "117",
                displayName: "Kuala Kubu Bharu",
            },
            {
                id: "128",
                displayName: "Kuala Lumpur",
            },
            {
                id: "122",
                displayName: "Kuang",
            },
            {
                id: "139",
                displayName: "Padang Jawa",
            },
            {
                id: "130",
                displayName: "Pantai Dalam",
            },
            {
                id: "146",
                displayName: "Pelabuhan Klang",
            },
            {
                id: "131",
                displayName: "Petaling",
            },
            {
                id: "126",
                displayName: "Putra",
            },
            {
                id: "118",
                displayName: "Rasa",
            },
            {
                id: "121",
                displayName: "Rawang",
            },
            {
                id: "125",
                displayName: "Segambut",
            },
            {
                id: "120",
                displayName: "Serendah",
            },
            {
                id: "134",
                displayName: "Seri Setia",
            },
            {
                id: "135",
                displayName: "Setia Jaya",
            },
            {
                id: "138",
                displayName: "Shah Alam",
            },
            {
                id: "76",
                displayName: "Subang Jaya",
            },
            {
                id: "40",
                displayName: "Sungai Buloh",
            },
            {
                id: "116",
                displayName: "Tanjung Malim",
            },
            {
                id: "143",
                displayName: "Teluk Gadong",
            },
            {
                id: "142",
                displayName: "Teluk Pulai",
            },
        ],
    },
    {
        id: "14",
        code: "KTMK-PRL",
        displayName: "KTM Komuter - Padang Rengas Line",
        vehicles: [
            {
                id: "315",
                identificationNo: "EMU19",
            },
            {
                id: "316",
                identificationNo: "EMU20",
            },
            {
                id: "317",
                identificationNo: "EMU21",
            },
            {
                id: "318",
                identificationNo: "EMU22",
            },
            {
                id: "319",
                identificationNo: "EMU23",
            },
            {
                id: "320",
                identificationNo: "EMU24",
            },
            {
                id: "321",
                identificationNo: "EMU25",
            },
            {
                id: "322",
                identificationNo: "EMU26",
            },
            {
                id: "323",
                identificationNo: "EMU27",
            },
            {
                id: "324",
                identificationNo: "EMU28",
            },
            {
                id: "325",
                identificationNo: "EMU29",
            },
            {
                id: "326",
                identificationNo: "EMU30",
            },
            {
                id: "327",
                identificationNo: "EMU31",
            },
            {
                id: "328",
                identificationNo: "EMU32",
            },
            {
                id: "329",
                identificationNo: "EMU33",
            },
            {
                id: "330",
                identificationNo: "EMU34",
            },
            {
                id: "331",
                identificationNo: "EMU35",
            },
            {
                id: "332",
                identificationNo: "EMU36",
            },
            {
                id: "333",
                identificationNo: "EMU37",
            },
            {
                id: "334",
                identificationNo: "EMU38",
            },
            {
                id: "335",
                identificationNo: "EMU39",
            },
            {
                id: "336",
                identificationNo: "EMU40",
            },
            {
                id: "337",
                identificationNo: "SCS01",
            },
            {
                id: "338",
                identificationNo: "SCS02",
            },
            {
                id: "339",
                identificationNo: "SCS03",
            },
            {
                id: "340",
                identificationNo: "SCS04",
            },
            {
                id: "341",
                identificationNo: "SCS05",
            },
            {
                id: "342",
                identificationNo: "SCS06",
            },
            {
                id: "343",
                identificationNo: "SCS07",
            },
            {
                id: "344",
                identificationNo: "SCS08",
            },
            {
                id: "345",
                identificationNo: "SCS09",
            },
            {
                id: "346",
                identificationNo: "SCS10",
            },
            {
                id: "347",
                identificationNo: "SCS11",
            },
            {
                id: "348",
                identificationNo: "SCS12",
            },
            {
                id: "349",
                identificationNo: "SCS13",
            },
            {
                id: "350",
                identificationNo: "SCS14",
            },
            {
                id: "351",
                identificationNo: "SCS15",
            },
            {
                id: "352",
                identificationNo: "SCS16",
            },
            {
                id: "353",
                identificationNo: "SCS17",
            },
            {
                id: "354",
                identificationNo: "SCS18",
            },
            {
                id: "355",
                identificationNo: "SCS19",
            },
            {
                id: "356",
                identificationNo: "SCS20",
            },
            {
                id: "357",
                identificationNo: "SCS21",
            },
            {
                id: "358",
                identificationNo: "SCS22",
            },
            {
                id: "359",
                identificationNo: "SCS23",
            },
            {
                id: "360",
                identificationNo: "SCS24",
            },
            {
                id: "361",
                identificationNo: "SCS25",
            },
            {
                id: "362",
                identificationNo: "SCS26",
            },
            {
                id: "363",
                identificationNo: "SCS27",
            },
            {
                id: "364",
                identificationNo: "SCS28",
            },
            {
                id: "365",
                identificationNo: "SCS29",
            },
            {
                id: "366",
                identificationNo: "SCS30",
            },
            {
                id: "367",
                identificationNo: "SCS31",
            },
            {
                id: "368",
                identificationNo: "SCS32",
            },
            {
                id: "369",
                identificationNo: "SCS33",
            },
            {
                id: "370",
                identificationNo: "SCS34",
            },
            {
                id: "371",
                identificationNo: "SCS35",
            },
            {
                id: "372",
                identificationNo: "SCS36",
            },
            {
                id: "373",
                identificationNo: "SCS37",
            },
            {
                id: "374",
                identificationNo: "SCS38",
            },
        ],
        stations: [
            {
                id: "188",
                displayName: "Bagan Serai",
            },
            {
                id: "174",
                displayName: "Bukit Mertajam",
            },
            {
                id: "173",
                displayName: "Bukit Tengah",
            },
            {
                id: "172",
                displayName: "Butterworth",
            },
            {
                id: "189",
                displayName: "Kamunting",
            },
            {
                id: "186",
                displayName: "Nibong Tebal",
            },
            {
                id: "191",
                displayName: "Padang Rengas",
            },
            {
                id: "187",
                displayName: "Parit Buntar",
            },
            {
                id: "185",
                displayName: "Simpang Ampat",
            },
            {
                id: "190",
                displayName: "Taiping",
            },
        ],
    },
    {
        id: "7",
        code: "KTMK-SRL",
        displayName: "KTM Komuter - Seremban Line",
        vehicles: [
            {
                id: "297",
                identificationNo: "EMU01",
            },
            {
                id: "298",
                identificationNo: "EMU02",
            },
            {
                id: "299",
                identificationNo: "EMU03",
            },
            {
                id: "300",
                identificationNo: "EMU04",
            },
            {
                id: "301",
                identificationNo: "EMU05",
            },
            {
                id: "302",
                identificationNo: "EMU06",
            },
            {
                id: "303",
                identificationNo: "EMU07",
            },
            {
                id: "304",
                identificationNo: "EMU08",
            },
            {
                id: "305",
                identificationNo: "EMU09",
            },
            {
                id: "306",
                identificationNo: "EMU10",
            },
            {
                id: "307",
                identificationNo: "EMU11",
            },
            {
                id: "308",
                identificationNo: "EMU12",
            },
            {
                id: "309",
                identificationNo: "EMU13",
            },
            {
                id: "310",
                identificationNo: "EMU14",
            },
            {
                id: "311",
                identificationNo: "EMU15",
            },
            {
                id: "312",
                identificationNo: "EMU16",
            },
            {
                id: "313",
                identificationNo: "EMU17",
            },
            {
                id: "314",
                identificationNo: "EMU18",
            },
            {
                id: "315",
                identificationNo: "EMU19",
            },
            {
                id: "316",
                identificationNo: "EMU20",
            },
            {
                id: "317",
                identificationNo: "EMU21",
            },
            {
                id: "318",
                identificationNo: "EMU22",
            },
            {
                id: "319",
                identificationNo: "EMU23",
            },
            {
                id: "320",
                identificationNo: "EMU24",
            },
            {
                id: "321",
                identificationNo: "EMU25",
            },
            {
                id: "322",
                identificationNo: "EMU26",
            },
            {
                id: "323",
                identificationNo: "EMU27",
            },
            {
                id: "324",
                identificationNo: "EMU28",
            },
            {
                id: "325",
                identificationNo: "EMU29",
            },
            {
                id: "326",
                identificationNo: "EMU30",
            },
            {
                id: "327",
                identificationNo: "EMU31",
            },
            {
                id: "328",
                identificationNo: "EMU32",
            },
            {
                id: "329",
                identificationNo: "EMU33",
            },
            {
                id: "330",
                identificationNo: "EMU34",
            },
            {
                id: "331",
                identificationNo: "EMU35",
            },
            {
                id: "332",
                identificationNo: "EMU36",
            },
            {
                id: "333",
                identificationNo: "EMU37",
            },
            {
                id: "334",
                identificationNo: "EMU38",
            },
            {
                id: "335",
                identificationNo: "EMU39",
            },
            {
                id: "336",
                identificationNo: "EMU40",
            },
            {
                id: "337",
                identificationNo: "SCS01",
            },
            {
                id: "338",
                identificationNo: "SCS02",
            },
            {
                id: "339",
                identificationNo: "SCS03",
            },
            {
                id: "340",
                identificationNo: "SCS04",
            },
            {
                id: "341",
                identificationNo: "SCS05",
            },
            {
                id: "342",
                identificationNo: "SCS06",
            },
            {
                id: "343",
                identificationNo: "SCS07",
            },
            {
                id: "344",
                identificationNo: "SCS08",
            },
            {
                id: "345",
                identificationNo: "SCS09",
            },
            {
                id: "346",
                identificationNo: "SCS10",
            },
            {
                id: "347",
                identificationNo: "SCS11",
            },
            {
                id: "348",
                identificationNo: "SCS12",
            },
            {
                id: "349",
                identificationNo: "SCS13",
            },
            {
                id: "350",
                identificationNo: "SCS14",
            },
            {
                id: "351",
                identificationNo: "SCS15",
            },
            {
                id: "352",
                identificationNo: "SCS16",
            },
            {
                id: "353",
                identificationNo: "SCS17",
            },
            {
                id: "354",
                identificationNo: "SCS18",
            },
            {
                id: "355",
                identificationNo: "SCS19",
            },
            {
                id: "356",
                identificationNo: "SCS20",
            },
            {
                id: "357",
                identificationNo: "SCS21",
            },
            {
                id: "358",
                identificationNo: "SCS22",
            },
            {
                id: "359",
                identificationNo: "SCS23",
            },
            {
                id: "360",
                identificationNo: "SCS24",
            },
            {
                id: "361",
                identificationNo: "SCS25",
            },
            {
                id: "362",
                identificationNo: "SCS26",
            },
            {
                id: "363",
                identificationNo: "SCS27",
            },
            {
                id: "364",
                identificationNo: "SCS28",
            },
            {
                id: "365",
                identificationNo: "SCS29",
            },
            {
                id: "366",
                identificationNo: "SCS30",
            },
            {
                id: "367",
                identificationNo: "SCS31",
            },
            {
                id: "368",
                identificationNo: "SCS32",
            },
            {
                id: "369",
                identificationNo: "SCS33",
            },
            {
                id: "370",
                identificationNo: "SCS34",
            },
            {
                id: "371",
                identificationNo: "SCS35",
            },
            {
                id: "372",
                identificationNo: "SCS36",
            },
            {
                id: "373",
                identificationNo: "SCS37",
            },
            {
                id: "374",
                identificationNo: "SCS38",
            },
            {
                id: "375",
                identificationNo: "EMU41",
            },
            {
                id: "376",
                identificationNo: "EMU42",
            },
            {
                id: "377",
                identificationNo: "EMU43",
            },
            {
                id: "378",
                identificationNo: "EMU44",
            },
            {
                id: "379",
                identificationNo: "EMU45",
            },
            {
                id: "380",
                identificationNo: "EMU46",
            },
            {
                id: "381",
                identificationNo: "EMU47",
            },
            {
                id: "382",
                identificationNo: "EMU48",
            },
            {
                id: "383",
                identificationNo: "EMU49",
            },
            {
                id: "384",
                identificationNo: "EMU50",
            },
            {
                id: "385",
                identificationNo: "EMU51",
            },
            {
                id: "386",
                identificationNo: "EMU52",
            },
            {
                id: "387",
                identificationNo: "EMU53",
            },
            {
                id: "388",
                identificationNo: "EMU54",
            },
            {
                id: "389",
                identificationNo: "EMU55",
            },
            {
                id: "390",
                identificationNo: "EMU56",
            },
            {
                id: "391",
                identificationNo: "EMU57",
            },
            {
                id: "392",
                identificationNo: "EMU58",
            },
            {
                id: "393",
                identificationNo: "EMU59",
            },
            {
                id: "394",
                identificationNo: "EMU60",
            },
            {
                id: "395",
                identificationNo: "EMU61",
            },
            {
                id: "396",
                identificationNo: "EMU62",
            },
        ],
        stations: [
            {
                id: "102",
                displayName: "Bandar Tasik Selatan",
            },
            {
                id: "156",
                displayName: "Bangi",
            },
            {
                id: "127",
                displayName: "Bank Negara",
            },
            {
                id: "157",
                displayName: "Batang Benar",
            },
            {
                id: "147",
                displayName: "Batu Caves",
            },
            {
                id: "149",
                displayName: "Batu Kentonmen",
            },
            {
                id: "1",
                displayName: "KL Sentral",
            },
            {
                id: "38",
                displayName: "Kajang",
            },
            {
                id: "154",
                displayName: "Kajang 2",
            },
            {
                id: "49",
                displayName: "Kampung Batu",
            },
            {
                id: "128",
                displayName: "Kuala Lumpur",
            },
            {
                id: "159",
                displayName: "Labu",
            },
            {
                id: "151",
                displayName: "Mid Valley",
            },
            {
                id: "158",
                displayName: "Nilai",
            },
            {
                id: "165",
                displayName: "Pulau Sebang",
            },
            {
                id: "126",
                displayName: "Putra",
            },
            {
                id: "164",
                displayName: "Rembau",
            },
            {
                id: "100",
                displayName: "Salak Selatan",
            },
            {
                id: "162",
                displayName: "Senawang",
            },
            {
                id: "87",
                displayName: "Sentul (KTM)",
            },
            {
                id: "152",
                displayName: "Seputeh",
            },
            {
                id: "153",
                displayName: "Serdang",
            },
            {
                id: "161",
                displayName: "Seremban",
            },
            {
                id: "163",
                displayName: "Sungai Gadut",
            },
            {
                id: "148",
                displayName: "Taman Wahyu",
            },
            {
                id: "160",
                displayName: "Tiroi",
            },
            {
                id: "155",
                displayName: "UKM",
            },
        ],
    },
    {
        id: "5",
        code: "LRT AGL",
        displayName: "LRT Ampang  Line",
        vehicles: [
            {
                id: "256",
                identificationNo: "428",
            },
            {
                id: "257",
                identificationNo: "429",
            },
            {
                id: "258",
                identificationNo: "430",
            },
            {
                id: "259",
                identificationNo: "431",
            },
            {
                id: "260",
                identificationNo: "432",
            },
            {
                id: "261",
                identificationNo: "433",
            },
            {
                id: "262",
                identificationNo: "434",
            },
            {
                id: "263",
                identificationNo: "435",
            },
            {
                id: "264",
                identificationNo: "436",
            },
            {
                id: "265",
                identificationNo: "437",
            },
            {
                id: "266",
                identificationNo: "438",
            },
            {
                id: "267",
                identificationNo: "439",
            },
            {
                id: "268",
                identificationNo: "440",
            },
            {
                id: "269",
                identificationNo: "441",
            },
            {
                id: "270",
                identificationNo: "442",
            },
            {
                id: "271",
                identificationNo: "443",
            },
            {
                id: "272",
                identificationNo: "444",
            },
            {
                id: "273",
                identificationNo: "445",
            },
            {
                id: "274",
                identificationNo: "446",
            },
            {
                id: "275",
                identificationNo: "447",
            },
            {
                id: "276",
                identificationNo: "448",
            },
            {
                id: "277",
                identificationNo: "449",
            },
            {
                id: "278",
                identificationNo: "450",
            },
            {
                id: "229",
                identificationNo: "301",
            },
            {
                id: "230",
                identificationNo: "302",
            },
            {
                id: "231",
                identificationNo: "303",
            },
            {
                id: "232",
                identificationNo: "304",
            },
            {
                id: "233",
                identificationNo: "305",
            },
            {
                id: "234",
                identificationNo: "306",
            },
            {
                id: "235",
                identificationNo: "307",
            },
            {
                id: "236",
                identificationNo: "308",
            },
            {
                id: "237",
                identificationNo: "309",
            },
            {
                id: "238",
                identificationNo: "310",
            },
            {
                id: "239",
                identificationNo: "311",
            },
            {
                id: "240",
                identificationNo: "312",
            },
            {
                id: "241",
                identificationNo: "313",
            },
            {
                id: "242",
                identificationNo: "314",
            },
            {
                id: "243",
                identificationNo: "315",
            },
            {
                id: "244",
                identificationNo: "316",
            },
            {
                id: "245",
                identificationNo: "317",
            },
            {
                id: "246",
                identificationNo: "318",
            },
            {
                id: "247",
                identificationNo: "319",
            },
            {
                id: "248",
                identificationNo: "320",
            },
            {
                id: "249",
                identificationNo: "421",
            },
            {
                id: "250",
                identificationNo: "422",
            },
            {
                id: "251",
                identificationNo: "423",
            },
            {
                id: "252",
                identificationNo: "424",
            },
            {
                id: "253",
                identificationNo: "425",
            },
            {
                id: "254",
                identificationNo: "426",
            },
            {
                id: "255",
                identificationNo: "427",
            },
        ],
        stations: [
            {
                id: "98",
                displayName: "Ampang",
            },
            {
                id: "90",
                displayName: "Bandaraya",
            },
            {
                id: "97",
                displayName: "Cahaya",
            },
            {
                id: "96",
                displayName: "Cempaka",
            },
            {
                id: "92",
                displayName: "Chan Sow Lin",
            },
            {
                id: "4",
                displayName: "Hang Tuah",
            },
            {
                id: "26",
                displayName: "Maluri",
            },
            {
                id: "63",
                displayName: "Masjid Jamek",
            },
            {
                id: "23",
                displayName: "Merdeka / Plaza Rakyat",
            },
            {
                id: "93",
                displayName: "Miharja",
            },
            {
                id: "88",
                displayName: "PWTC",
            },
            {
                id: "95",
                displayName: "Pandan Indah",
            },
            {
                id: "94",
                displayName: "Pandan Jaya",
            },
            {
                id: "91",
                displayName: "Pudu",
            },
            {
                id: "150",
                displayName: "Sentul (RapidKL)",
            },
            {
                id: "86",
                displayName: "Sentul Timur",
            },
            {
                id: "89",
                displayName: "Sultan Ismail",
            },
            {
                id: "11",
                displayName: "Titiwangsa",
            },
        ],
    },
    {
        id: "4",
        code: "LRT KJL",
        displayName: "LRT Kelana Jaya Line",
        vehicles: [
            {
                id: "542",
                identificationNo: "35",
            },
            {
                id: "543",
                identificationNo: "34",
            },
            {
                id: "544",
                identificationNo: "30",
            },
            {
                id: "545",
                identificationNo: "29",
            },
            {
                id: "559",
                identificationNo: "28",
            },
            {
                id: "560",
                identificationNo: "33",
            },
            {
                id: "564",
                identificationNo: "27",
            },
            {
                id: "565",
                identificationNo: "26",
            },
            {
                id: "103",
                identificationNo: "01 (Old)",
            },
            {
                id: "104",
                identificationNo: "02 (Old)",
            },
            {
                id: "105",
                identificationNo: "03 (Old)",
            },
            {
                id: "106",
                identificationNo: "04 (Old)",
            },
            {
                id: "107",
                identificationNo: "05 (Old)",
            },
            {
                id: "108",
                identificationNo: "06 (Old)",
            },
            {
                id: "109",
                identificationNo: "07 (Old)",
            },
            {
                id: "110",
                identificationNo: "08 (Old)",
            },
            {
                id: "111",
                identificationNo: "09 (Old)",
            },
            {
                id: "112",
                identificationNo: "10 (Old)",
            },
            {
                id: "113",
                identificationNo: "11 (Old)",
            },
            {
                id: "114",
                identificationNo: "12 (Old)",
            },
            {
                id: "115",
                identificationNo: "13 (Old)",
            },
            {
                id: "116",
                identificationNo: "14 (Old)",
            },
            {
                id: "117",
                identificationNo: "15 (Old)",
            },
            {
                id: "118",
                identificationNo: "16 (Old)",
            },
            {
                id: "119",
                identificationNo: "15 (17 Renum)",
            },
            {
                id: "120",
                identificationNo: "18 (Old)",
            },
            {
                id: "121",
                identificationNo: "19 (Old)",
            },
            {
                id: "122",
                identificationNo: "20 (Old)",
            },
            {
                id: "123",
                identificationNo: "21 (Old)",
            },
            {
                id: "124",
                identificationNo: "22 (Old)",
            },
            {
                id: "125",
                identificationNo: "23 (Old)",
            },
            {
                id: "126",
                identificationNo: "01 (24 Renum)",
            },
            {
                id: "127",
                identificationNo: "07 (25 Renum)",
            },
            {
                id: "128",
                identificationNo: "26 (Old)",
            },
            {
                id: "129",
                identificationNo: "27 (Old)",
            },
            {
                id: "130",
                identificationNo: "28 (Old)",
            },
            {
                id: "131",
                identificationNo: "29 (Old)",
            },
            {
                id: "132",
                identificationNo: "13 (30 Renum)",
            },
            {
                id: "133",
                identificationNo: "31 (Old)",
            },
            {
                id: "134",
                identificationNo: "32 (Old)",
            },
            {
                id: "135",
                identificationNo: "16 (33 Renum)",
            },
            {
                id: "136",
                identificationNo: "34 (Old)",
            },
            {
                id: "137",
                identificationNo: "35 (Old)",
            },
            {
                id: "167",
                identificationNo: "36",
            },
            {
                id: "168",
                identificationNo: "37",
            },
            {
                id: "169",
                identificationNo: "38",
            },
            {
                id: "170",
                identificationNo: "39",
            },
            {
                id: "171",
                identificationNo: "40",
            },
            {
                id: "172",
                identificationNo: "41",
            },
            {
                id: "173",
                identificationNo: "42",
            },
            {
                id: "174",
                identificationNo: "43",
            },
            {
                id: "175",
                identificationNo: "44",
            },
            {
                id: "176",
                identificationNo: "45",
            },
            {
                id: "177",
                identificationNo: "46",
            },
            {
                id: "178",
                identificationNo: "47",
            },
            {
                id: "179",
                identificationNo: "48",
            },
            {
                id: "180",
                identificationNo: "49",
            },
            {
                id: "181",
                identificationNo: "50",
            },
            {
                id: "182",
                identificationNo: "51",
            },
            {
                id: "183",
                identificationNo: "52",
            },
            {
                id: "184",
                identificationNo: "53",
            },
            {
                id: "185",
                identificationNo: "54",
            },
            {
                id: "186",
                identificationNo: "55",
            },
            {
                id: "187",
                identificationNo: "56",
            },
            {
                id: "188",
                identificationNo: "57",
            },
            {
                id: "189",
                identificationNo: "58",
            },
            {
                id: "190",
                identificationNo: "59",
            },
            {
                id: "191",
                identificationNo: "60",
            },
            {
                id: "192",
                identificationNo: "61",
            },
            {
                id: "193",
                identificationNo: "62",
            },
            {
                id: "194",
                identificationNo: "63",
            },
            {
                id: "195",
                identificationNo: "64",
            },
            {
                id: "196",
                identificationNo: "65",
            },
            {
                id: "197",
                identificationNo: "66",
            },
            {
                id: "198",
                identificationNo: "67",
            },
            {
                id: "199",
                identificationNo: "68",
            },
            {
                id: "200",
                identificationNo: "69",
            },
            {
                id: "201",
                identificationNo: "70",
            },
            {
                id: "202",
                identificationNo: "72",
            },
            {
                id: "203",
                identificationNo: "73",
            },
            {
                id: "204",
                identificationNo: "74",
            },
            {
                id: "205",
                identificationNo: "75",
            },
            {
                id: "206",
                identificationNo: "76",
            },
            {
                id: "207",
                identificationNo: "77",
            },
            {
                id: "208",
                identificationNo: "78",
            },
            {
                id: "209",
                identificationNo: "79",
            },
            {
                id: "210",
                identificationNo: "80",
            },
            {
                id: "211",
                identificationNo: "81",
            },
            {
                id: "212",
                identificationNo: "82",
            },
            {
                id: "213",
                identificationNo: "83",
            },
            {
                id: "214",
                identificationNo: "84",
            },
            {
                id: "215",
                identificationNo: "85",
            },
            {
                id: "216",
                identificationNo: "87",
            },
            {
                id: "217",
                identificationNo: "88",
            },
            {
                id: "218",
                identificationNo: "89",
            },
            {
                id: "219",
                identificationNo: "90",
            },
            {
                id: "220",
                identificationNo: "91",
            },
            {
                id: "221",
                identificationNo: "92",
            },
            {
                id: "222",
                identificationNo: "93",
            },
            {
                id: "223",
                identificationNo: "94",
            },
            {
                id: "224",
                identificationNo: "95",
            },
            {
                id: "225",
                identificationNo: "96",
            },
            {
                id: "226",
                identificationNo: "97",
            },
            {
                id: "227",
                identificationNo: "98",
            },
            {
                id: "228",
                identificationNo: "99",
            },
        ],
        stations: [
            {
                id: "65",
                displayName: "Abdullah Hukum",
            },
            {
                id: "83",
                displayName: "Alam Megah",
            },
            {
                id: "59",
                displayName: "Ampang Park",
            },
            {
                id: "74",
                displayName: "Ara Damansara",
            },
            {
                id: "69",
                displayName: "Asia Jaya",
            },
            {
                id: "64",
                displayName: "Bangsar",
            },
            {
                id: "58",
                displayName: "Damai",
            },
            {
                id: "62",
                displayName: "Dang Wangi",
            },
            {
                id: "57",
                displayName: "Dato' Keramat",
            },
            {
                id: "75",
                displayName: "Glenmarie",
            },
            {
                id: "51",
                displayName: "Gombak",
            },
            {
                id: "56",
                displayName: "Jelatek",
            },
            {
                id: "1",
                displayName: "KL Sentral",
            },
            {
                id: "60",
                displayName: "KLCC",
            },
            {
                id: "61",
                displayName: "Kampung Baru",
            },
            {
                id: "72",
                displayName: "Kelana Jaya",
            },
            {
                id: "66",
                displayName: "Kerinchi",
            },
            {
                id: "73",
                displayName: "Lembah Subang",
            },
            {
                id: "63",
                displayName: "Masjid Jamek",
            },
            {
                id: "22",
                displayName: "Pasar Seni",
            },
            {
                id: "85",
                displayName: "Putra Heights",
            },
            {
                id: "77",
                displayName: "SS15",
            },
            {
                id: "78",
                displayName: "SS18",
            },
            {
                id: "55",
                displayName: "Setiawangsa",
            },
            {
                id: "54",
                displayName: "Sri Rampai",
            },
            {
                id: "84",
                displayName: "Subang Alam",
            },
            {
                id: "76",
                displayName: "Subang Jaya",
            },
            {
                id: "80",
                displayName: "Taipan",
            },
            {
                id: "71",
                displayName: "Taman Bahagia",
            },
            {
                id: "68",
                displayName: "Taman Jaya",
            },
            {
                id: "52",
                displayName: "Taman Melati",
            },
            {
                id: "70",
                displayName: "Taman Paramount",
            },
            {
                id: "82",
                displayName: "USJ21",
            },
            {
                id: "79",
                displayName: "USJ7",
            },
            {
                id: "67",
                displayName: "Universiti",
            },
            {
                id: "53",
                displayName: "Wangsa Maju",
            },
            {
                id: "81",
                displayName: "Wawasan",
            },
        ],
    },
    {
        id: "16",
        code: "LRT SAL",
        displayName: "LRT Shah Alam Line",
        vehicles: [
            {
                id: "576",
                identificationNo: "319",
            },
            {
                id: "577",
                identificationNo: "320",
            },
            {
                id: "578",
                identificationNo: "321",
            },
            {
                id: "579",
                identificationNo: "322",
            },
            {
                id: "566",
                identificationNo: "301",
            },
            {
                id: "567",
                identificationNo: "302",
            },
            {
                id: "568",
                identificationNo: "303",
            },
            {
                id: "569",
                identificationNo: "304",
            },
            {
                id: "570",
                identificationNo: "305",
            },
            {
                id: "571",
                identificationNo: "306",
            },
            {
                id: "572",
                identificationNo: "307",
            },
            {
                id: "573",
                identificationNo: "308",
            },
            {
                id: "574",
                identificationNo: "310",
            },
            {
                id: "575",
                identificationNo: "313",
            },
        ],
        stations: [],
    },
    {
        id: "9",
        code: "LRT SPL",
        displayName: "LRT Sri Petaling Line",
        vehicles: [
            {
                id: "256",
                identificationNo: "428",
            },
            {
                id: "257",
                identificationNo: "429",
            },
            {
                id: "258",
                identificationNo: "430",
            },
            {
                id: "259",
                identificationNo: "431",
            },
            {
                id: "260",
                identificationNo: "432",
            },
            {
                id: "261",
                identificationNo: "433",
            },
            {
                id: "262",
                identificationNo: "434",
            },
            {
                id: "263",
                identificationNo: "435",
            },
            {
                id: "264",
                identificationNo: "436",
            },
            {
                id: "265",
                identificationNo: "437",
            },
            {
                id: "266",
                identificationNo: "438",
            },
            {
                id: "267",
                identificationNo: "439",
            },
            {
                id: "268",
                identificationNo: "440",
            },
            {
                id: "269",
                identificationNo: "441",
            },
            {
                id: "270",
                identificationNo: "442",
            },
            {
                id: "271",
                identificationNo: "443",
            },
            {
                id: "272",
                identificationNo: "444",
            },
            {
                id: "273",
                identificationNo: "445",
            },
            {
                id: "274",
                identificationNo: "446",
            },
            {
                id: "275",
                identificationNo: "447",
            },
            {
                id: "276",
                identificationNo: "448",
            },
            {
                id: "277",
                identificationNo: "449",
            },
            {
                id: "278",
                identificationNo: "450",
            },
            {
                id: "229",
                identificationNo: "301",
            },
            {
                id: "230",
                identificationNo: "302",
            },
            {
                id: "231",
                identificationNo: "303",
            },
            {
                id: "232",
                identificationNo: "304",
            },
            {
                id: "233",
                identificationNo: "305",
            },
            {
                id: "234",
                identificationNo: "306",
            },
            {
                id: "235",
                identificationNo: "307",
            },
            {
                id: "236",
                identificationNo: "308",
            },
            {
                id: "237",
                identificationNo: "309",
            },
            {
                id: "238",
                identificationNo: "310",
            },
            {
                id: "239",
                identificationNo: "311",
            },
            {
                id: "240",
                identificationNo: "312",
            },
            {
                id: "241",
                identificationNo: "313",
            },
            {
                id: "242",
                identificationNo: "314",
            },
            {
                id: "243",
                identificationNo: "315",
            },
            {
                id: "244",
                identificationNo: "316",
            },
            {
                id: "245",
                identificationNo: "317",
            },
            {
                id: "246",
                identificationNo: "318",
            },
            {
                id: "247",
                identificationNo: "319",
            },
            {
                id: "248",
                identificationNo: "320",
            },
            {
                id: "249",
                identificationNo: "421",
            },
            {
                id: "250",
                identificationNo: "422",
            },
            {
                id: "251",
                identificationNo: "423",
            },
            {
                id: "252",
                identificationNo: "424",
            },
            {
                id: "253",
                identificationNo: "425",
            },
            {
                id: "254",
                identificationNo: "426",
            },
            {
                id: "255",
                identificationNo: "427",
            },
        ],
        stations: [
            {
                id: "108",
                displayName: "Alam Sutera",
            },
            {
                id: "106",
                displayName: "Awan Besar",
            },
            {
                id: "113",
                displayName: "Bandar Puteri",
            },
            {
                id: "102",
                displayName: "Bandar Tasik Selatan",
            },
            {
                id: "101",
                displayName: "Bandar Tun Razak",
            },
            {
                id: "90",
                displayName: "Bandaraya",
            },
            {
                id: "104",
                displayName: "Bukit Jalil",
            },
            {
                id: "92",
                displayName: "Chan Sow Lin",
            },
            {
                id: "99",
                displayName: "Cheras",
            },
            {
                id: "4",
                displayName: "Hang Tuah",
            },
            {
                id: "110",
                displayName: "IOI Puchong Jaya",
            },
            {
                id: "109",
                displayName: "Kinrara BK5",
            },
            {
                id: "63",
                displayName: "Masjid Jamek",
            },
            {
                id: "23",
                displayName: "Merdeka / Plaza Rakyat",
            },
            {
                id: "107",
                displayName: "Muhibbah",
            },
            {
                id: "88",
                displayName: "PWTC",
            },
            {
                id: "114",
                displayName: "Puchong Perdana",
            },
            {
                id: "115",
                displayName: "Puchong Prima",
            },
            {
                id: "91",
                displayName: "Pudu",
            },
            {
                id: "111",
                displayName: "Pusat Bandar Puchong",
            },
            {
                id: "85",
                displayName: "Putra Heights",
            },
            {
                id: "100",
                displayName: "Salak Selatan",
            },
            {
                id: "150",
                displayName: "Sentul (RapidKL)",
            },
            {
                id: "86",
                displayName: "Sentul Timur",
            },
            {
                id: "105",
                displayName: "Sri Petaling",
            },
            {
                id: "89",
                displayName: "Sultan Ismail",
            },
            {
                id: "103",
                displayName: "Sungai Besi",
            },
            {
                id: "112",
                displayName: "Taman Perindustrian Puchong",
            },
            {
                id: "11",
                displayName: "Titiwangsa",
            },
        ],
    },
    {
        id: "1",
        code: "MRL",
        displayName: "KL Monorail Line",
        vehicles: [
            {
                id: "1",
                identificationNo: "RSV01",
            },
            {
                id: "2",
                identificationNo: "RSV02",
            },
            {
                id: "3",
                identificationNo: "RSV03",
            },
            {
                id: "4",
                identificationNo: "RSV04",
            },
            {
                id: "5",
                identificationNo: "RSV05",
            },
            {
                id: "6",
                identificationNo: "RSV06",
            },
            {
                id: "7",
                identificationNo: "RSV07",
            },
            {
                id: "8",
                identificationNo: "RSV08",
            },
            {
                id: "9",
                identificationNo: "RSV09",
            },
            {
                id: "10",
                identificationNo: "RSV10",
            },
            {
                id: "11",
                identificationNo: "RSV11",
            },
            {
                id: "12",
                identificationNo: "RSV12",
            },
            {
                id: "13",
                identificationNo: "RSV21",
            },
            {
                id: "14",
                identificationNo: "RSV22",
            },
            {
                id: "15",
                identificationNo: "RSV23",
            },
            {
                id: "16",
                identificationNo: "RSV24",
            },
            {
                id: "17",
                identificationNo: "RSV25",
            },
            {
                id: "18",
                identificationNo: "RSV26",
            },
            {
                id: "19",
                identificationNo: "RSV27",
            },
            {
                id: "20",
                identificationNo: "RSV28",
            },
            {
                id: "21",
                identificationNo: "RSV29",
            },
            {
                id: "22",
                identificationNo: "RSV30",
            },
            {
                id: "23",
                identificationNo: "RSV31",
            },
            {
                id: "24",
                identificationNo: "RSV32",
            },
        ],
        stations: [
            {
                id: "6",
                displayName: "Bukit Bintang",
            },
            {
                id: "8",
                displayName: "Bukit Nanas",
            },
            {
                id: "10",
                displayName: "Chow Kit",
            },
            {
                id: "4",
                displayName: "Hang Tuah",
            },
            {
                id: "5",
                displayName: "Imbi",
            },
            {
                id: "1",
                displayName: "KL Sentral",
            },
            {
                id: "3",
                displayName: "Maharajalela",
            },
            {
                id: "9",
                displayName: "Medan Tuanku",
            },
            {
                id: "7",
                displayName: "Raja Chulan",
            },
            {
                id: "11",
                displayName: "Titiwangsa",
            },
            {
                id: "2",
                displayName: "Tun Sambanthan",
            },
        ],
    },
    {
        id: "2",
        code: "MRT KGL",
        displayName: "MRT Kajang Line",
        vehicles: [
            {
                id: "25",
                identificationNo: "101",
            },
            {
                id: "26",
                identificationNo: "102",
            },
            {
                id: "27",
                identificationNo: "103",
            },
            {
                id: "28",
                identificationNo: "104",
            },
            {
                id: "29",
                identificationNo: "105",
            },
            {
                id: "30",
                identificationNo: "106",
            },
            {
                id: "31",
                identificationNo: "107",
            },
            {
                id: "32",
                identificationNo: "108",
            },
            {
                id: "33",
                identificationNo: "109",
            },
            {
                id: "34",
                identificationNo: "110",
            },
            {
                id: "35",
                identificationNo: "111",
            },
            {
                id: "36",
                identificationNo: "112",
            },
            {
                id: "37",
                identificationNo: "113",
            },
            {
                id: "38",
                identificationNo: "114",
            },
            {
                id: "39",
                identificationNo: "115",
            },
            {
                id: "40",
                identificationNo: "116",
            },
            {
                id: "41",
                identificationNo: "117",
            },
            {
                id: "42",
                identificationNo: "118",
            },
            {
                id: "43",
                identificationNo: "119",
            },
            {
                id: "44",
                identificationNo: "120",
            },
            {
                id: "45",
                identificationNo: "121",
            },
            {
                id: "46",
                identificationNo: "122",
            },
            {
                id: "47",
                identificationNo: "123",
            },
            {
                id: "48",
                identificationNo: "124",
            },
            {
                id: "49",
                identificationNo: "125",
            },
            {
                id: "50",
                identificationNo: "126",
            },
            {
                id: "51",
                identificationNo: "127",
            },
            {
                id: "52",
                identificationNo: "128",
            },
            {
                id: "53",
                identificationNo: "129",
            },
            {
                id: "54",
                identificationNo: "130",
            },
            {
                id: "55",
                identificationNo: "131",
            },
            {
                id: "56",
                identificationNo: "132",
            },
            {
                id: "57",
                identificationNo: "133",
            },
            {
                id: "58",
                identificationNo: "134",
            },
            {
                id: "59",
                identificationNo: "135",
            },
            {
                id: "60",
                identificationNo: "136",
            },
            {
                id: "61",
                identificationNo: "137",
            },
            {
                id: "62",
                identificationNo: "138",
            },
            {
                id: "63",
                identificationNo: "139",
            },
            {
                id: "64",
                identificationNo: "140",
            },
            {
                id: "65",
                identificationNo: "141",
            },
            {
                id: "66",
                identificationNo: "142",
            },
            {
                id: "67",
                identificationNo: "143",
            },
            {
                id: "68",
                identificationNo: "144",
            },
            {
                id: "69",
                identificationNo: "145",
            },
            {
                id: "70",
                identificationNo: "146",
            },
            {
                id: "71",
                identificationNo: "147",
            },
            {
                id: "72",
                identificationNo: "148",
            },
            {
                id: "73",
                identificationNo: "149",
            },
            {
                id: "74",
                identificationNo: "150",
            },
            {
                id: "75",
                identificationNo: "151",
            },
            {
                id: "76",
                identificationNo: "152",
            },
            {
                id: "77",
                identificationNo: "153",
            },
            {
                id: "78",
                identificationNo: "154",
            },
            {
                id: "79",
                identificationNo: "155",
            },
            {
                id: "80",
                identificationNo: "156",
            },
            {
                id: "81",
                identificationNo: "157",
            },
            {
                id: "82",
                identificationNo: "158",
            },
        ],
        stations: [
            {
                id: "33",
                displayName: "Bandar Tun Hussein Onn",
            },
            {
                id: "17",
                displayName: "Bandar Utama",
            },
            {
                id: "34",
                displayName: "Batu Sebelas Cheras",
            },
            {
                id: "6",
                displayName: "Bukit Bintang",
            },
            {
                id: "35",
                displayName: "Bukit Dukung",
            },
            {
                id: "25",
                displayName: "Cochrane",
            },
            {
                id: "1",
                displayName: "KL Sentral",
            },
            {
                id: "38",
                displayName: "Kajang",
            },
            {
                id: "14",
                displayName: "Kota Damansara",
            },
            {
                id: "12",
                displayName: "Kwasa Damansara",
            },
            {
                id: "13",
                displayName: "Kwasa Sentral",
            },
            {
                id: "26",
                displayName: "Maluri",
            },
            {
                id: "23",
                displayName: "Merdeka / Plaza Rakyat",
            },
            {
                id: "16",
                displayName: "Mutiara Damansara",
            },
            {
                id: "227",
                displayName: "Muzium Negara",
            },
            {
                id: "22",
                displayName: "Pasar Seni",
            },
            {
                id: "19",
                displayName: "Phileo Damansara",
            },
            {
                id: "20",
                displayName: "Pusat Bandar Damansara",
            },
            {
                id: "21",
                displayName: "Semantan",
            },
            {
                id: "32",
                displayName: "Sri Raya",
            },
            {
                id: "37",
                displayName: "Stadium Kajang",
            },
            {
                id: "36",
                displayName: "Sungai Jernih",
            },
            {
                id: "15",
                displayName: "Surian",
            },
            {
                id: "18",
                displayName: "TTDI",
            },
            {
                id: "30",
                displayName: "Taman Connaught",
            },
            {
                id: "28",
                displayName: "Taman Midah",
            },
            {
                id: "29",
                displayName: "Taman Mutiara",
            },
            {
                id: "27",
                displayName: "Taman Pertama",
            },
            {
                id: "31",
                displayName: "Taman Suntex",
            },
            {
                id: "24",
                displayName: "Tun Razak Exchange",
            },
        ],
    },
    {
        id: "3",
        code: "MRT PYL",
        displayName: "MRT Putrajaya Line",
        vehicles: [
            {
                id: "138",
                identificationNo: "221",
            },
            {
                id: "139",
                identificationNo: "222",
            },
            {
                id: "140",
                identificationNo: "223",
            },
            {
                id: "141",
                identificationNo: "224",
            },
            {
                id: "142",
                identificationNo: "225",
            },
            {
                id: "143",
                identificationNo: "226",
            },
            {
                id: "144",
                identificationNo: "227",
            },
            {
                id: "145",
                identificationNo: "228",
            },
            {
                id: "146",
                identificationNo: "229",
            },
            {
                id: "147",
                identificationNo: "230",
            },
            {
                id: "148",
                identificationNo: "231",
            },
            {
                id: "149",
                identificationNo: "232",
            },
            {
                id: "150",
                identificationNo: "233",
            },
            {
                id: "151",
                identificationNo: "234",
            },
            {
                id: "152",
                identificationNo: "235",
            },
            {
                id: "153",
                identificationNo: "236",
            },
            {
                id: "154",
                identificationNo: "237",
            },
            {
                id: "155",
                identificationNo: "238",
            },
            {
                id: "156",
                identificationNo: "239",
            },
            {
                id: "157",
                identificationNo: "240",
            },
            {
                id: "158",
                identificationNo: "241",
            },
            {
                id: "159",
                identificationNo: "242",
            },
            {
                id: "160",
                identificationNo: "243",
            },
            {
                id: "161",
                identificationNo: "244",
            },
            {
                id: "162",
                identificationNo: "245",
            },
            {
                id: "163",
                identificationNo: "246",
            },
            {
                id: "164",
                identificationNo: "247",
            },
            {
                id: "165",
                identificationNo: "248",
            },
            {
                id: "166",
                identificationNo: "249",
            },
            {
                id: "83",
                identificationNo: "201",
            },
            {
                id: "84",
                identificationNo: "202",
            },
            {
                id: "85",
                identificationNo: "203",
            },
            {
                id: "86",
                identificationNo: "204",
            },
            {
                id: "87",
                identificationNo: "205",
            },
            {
                id: "88",
                identificationNo: "206",
            },
            {
                id: "89",
                identificationNo: "207",
            },
            {
                id: "90",
                identificationNo: "208",
            },
            {
                id: "91",
                identificationNo: "209",
            },
            {
                id: "92",
                identificationNo: "210",
            },
            {
                id: "93",
                identificationNo: "211",
            },
            {
                id: "94",
                identificationNo: "212",
            },
            {
                id: "95",
                identificationNo: "213",
            },
            {
                id: "96",
                identificationNo: "214",
            },
            {
                id: "97",
                identificationNo: "215",
            },
            {
                id: "98",
                identificationNo: "216",
            },
            {
                id: "99",
                identificationNo: "217",
            },
            {
                id: "100",
                identificationNo: "218",
            },
            {
                id: "101",
                identificationNo: "219",
            },
            {
                id: "102",
                identificationNo: "220",
            },
        ],
        stations: [
            {
                id: "224",
                displayName: "16 Sierra",
            },
            {
                id: "59",
                displayName: "Ampang Park",
            },
            {
                id: "92",
                displayName: "Chan Sow Lin",
            },
            {
                id: "215",
                displayName: "Conlay",
            },
            {
                id: "226",
                displayName: "Cyberjaya City Centre",
            },
            {
                id: "225",
                displayName: "Cyberjaya Utara",
            },
            {
                id: "41",
                displayName: "Damansara Damai",
            },
            {
                id: "212",
                displayName: "Hospital Kuala Lumpur",
            },
            {
                id: "210",
                displayName: "Jalan Ipoh",
            },
            {
                id: "47",
                displayName: "Jinjang",
            },
            {
                id: "49",
                displayName: "Kampung Batu",
            },
            {
                id: "39",
                displayName: "Kampung Selamat",
            },
            {
                id: "209",
                displayName: "Kentonmen",
            },
            {
                id: "46",
                displayName: "Kepong Baru",
            },
            {
                id: "216",
                displayName: "Kuchai",
            },
            {
                id: "12",
                displayName: "Kwasa Damansara",
            },
            {
                id: "45",
                displayName: "Metro Prima",
            },
            {
                id: "214",
                displayName: "Persiaran KLCC",
            },
            {
                id: "166",
                displayName: "Putrajaya Sentral",
            },
            {
                id: "213",
                displayName: "Raja Uda",
            },
            {
                id: "211",
                displayName: "Sentul Barat",
            },
            {
                id: "220",
                displayName: "Serdang Jaya",
            },
            {
                id: "219",
                displayName: "Serdang Raya Selatan",
            },
            {
                id: "218",
                displayName: "Serdang Raya Utara",
            },
            {
                id: "42",
                displayName: "Sri Damansara Barat",
            },
            {
                id: "43",
                displayName: "Sri Damansara Sentral",
            },
            {
                id: "44",
                displayName: "Sri Damansara Timur",
            },
            {
                id: "48",
                displayName: "Sri Delima",
            },
            {
                id: "103",
                displayName: "Sungai Besi",
            },
            {
                id: "40",
                displayName: "Sungai Buloh",
            },
            {
                id: "222",
                displayName: "Taman Equine",
            },
            {
                id: "217",
                displayName: "Taman Naga Emas",
            },
            {
                id: "223",
                displayName: "Taman Putra Permai",
            },
            {
                id: "11",
                displayName: "Titiwangsa",
            },
            {
                id: "24",
                displayName: "Tun Razak Exchange",
            },
            {
                id: "221",
                displayName: "UPM",
            },
        ],
    },
    {
        id: "11",
        code: "Skypark",
        displayName: "KTM Skypark Link",
        vehicles: [
            {
                id: "297",
                identificationNo: "EMU01",
            },
            {
                id: "298",
                identificationNo: "EMU02",
            },
            {
                id: "299",
                identificationNo: "EMU03",
            },
            {
                id: "300",
                identificationNo: "EMU04",
            },
            {
                id: "301",
                identificationNo: "EMU05",
            },
            {
                id: "302",
                identificationNo: "EMU06",
            },
            {
                id: "303",
                identificationNo: "EMU07",
            },
            {
                id: "304",
                identificationNo: "EMU08",
            },
            {
                id: "305",
                identificationNo: "EMU09",
            },
            {
                id: "306",
                identificationNo: "EMU10",
            },
            {
                id: "307",
                identificationNo: "EMU11",
            },
            {
                id: "308",
                identificationNo: "EMU12",
            },
            {
                id: "309",
                identificationNo: "EMU13",
            },
            {
                id: "310",
                identificationNo: "EMU14",
            },
            {
                id: "311",
                identificationNo: "EMU15",
            },
            {
                id: "312",
                identificationNo: "EMU16",
            },
            {
                id: "313",
                identificationNo: "EMU17",
            },
            {
                id: "314",
                identificationNo: "EMU18",
            },
            {
                id: "315",
                identificationNo: "EMU19",
            },
            {
                id: "316",
                identificationNo: "EMU20",
            },
            {
                id: "317",
                identificationNo: "EMU21",
            },
            {
                id: "318",
                identificationNo: "EMU22",
            },
            {
                id: "319",
                identificationNo: "EMU23",
            },
            {
                id: "320",
                identificationNo: "EMU24",
            },
            {
                id: "321",
                identificationNo: "EMU25",
            },
            {
                id: "322",
                identificationNo: "EMU26",
            },
            {
                id: "323",
                identificationNo: "EMU27",
            },
            {
                id: "324",
                identificationNo: "EMU28",
            },
            {
                id: "325",
                identificationNo: "EMU29",
            },
            {
                id: "326",
                identificationNo: "EMU30",
            },
            {
                id: "327",
                identificationNo: "EMU31",
            },
            {
                id: "328",
                identificationNo: "EMU32",
            },
            {
                id: "329",
                identificationNo: "EMU33",
            },
            {
                id: "330",
                identificationNo: "EMU34",
            },
            {
                id: "331",
                identificationNo: "EMU35",
            },
            {
                id: "332",
                identificationNo: "EMU36",
            },
            {
                id: "333",
                identificationNo: "EMU37",
            },
            {
                id: "334",
                identificationNo: "EMU38",
            },
            {
                id: "335",
                identificationNo: "EMU39",
            },
            {
                id: "336",
                identificationNo: "EMU40",
            },
        ],
        stations: [
            {
                id: "1",
                displayName: "KL Sentral",
            },
            {
                id: "76",
                displayName: "Subang Jaya",
            },
            {
                id: "170",
                displayName: "Terminal Skypark",
            },
        ],
    },
];
