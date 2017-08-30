Pipedrive Leads Loader
===

- _This script pull leads from a remote AWS S3 bucket, not from a local CSV file. The script must be updated accordingly for a different purpose._

- _This script is sending the missing timezones by email using SendGrid._

### Imput format

The CSV must have at least to following columns:

```
workspaceDisplayName
workspaceCreatedDate
membersCount
countryCode
ownerName
ownerEmail
ownerTimezone
ownerLanguage
ownerPhone
```

### Leads dispatch to representatives

A file named `representatives.json` is required at the root of the project folder.  
It should have to following format:

```json
{
  "representative1@test.com": ["JP", "KR"],
  "representative2@test.com": ["US", "CA", "UK", "NZ", "AU"],
  "representative3@test.com": ["FR", "IT", "SP", "NE", "DK", "SE", "NW", "FI"],
  "representative4@test.com": ["DE", "CH", "AT"]
}
```

To add new countries for representatives, please refer to this [JSON file](https://github.com/moment/moment-timezone/blob/develop/data/meta/latest.json).

__Important__: _Be careful to enter the right country code (e.g. United Kingdom is "GB", not "UK". Cambodia is "KH")_

### Missing countries

Sometimes, an existing timezone is not recorded in the [JSON file](https://github.com/moment/moment-timezone/blob/develop/data/meta/latest.json). After a `--test` dry-run, you will see the timezones actually present in the CSV file but missing from the JSON file. You can add those timezone manually in `country/missings.js` with the right country code.

If you need to add a new domain extension or a new language, add them respectively in `country/extensions.js` and `country/languages.js`


### Usage

```
Usage: node index.js [OPTS]

OPTS:
Usage:
  --test                    dry-run
  --force                   load the leads
```
