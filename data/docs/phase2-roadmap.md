# CRC Field Intel -- Phase 2 Roadmap

## DIRECT MAIL AUTOMATION

Timeline: Build when Phase 1 is proven in the field

### The Flow

1. Rep circles a storm-affected area on the map
2. System pulls all property addresses in that zone from county auditor records:
   - Franklin County Auditor API
   - Delaware County Auditor
   - Licking County Auditor
   - Any Ohio county in Columbus metro
3. System cross-references against existing leads to avoid duplicates
4. System generates postcard mailing list
5. Rep reviews and approves the list
6. Lob.com sends postcards automatically
   - CRC storm damage postcard template
   - Personalized with homeowner name
   - ~$0.75 per piece
   - Delivered in 3-5 business days
7. Responses come in as new leads via QR code or phone number on the postcard

### Commercial Version

Same flow but for commercial properties:
- Filter by property class: commercial
- Pull business name from auditor records or Google Places
- Higher value targets -- bigger roofs
- Less competition than residential canvassing

### Skip Trace Integration (Phase 3)

For properties where owner info is limited:
- Integrate with BatchSkipTracing or Spokeo API
- Get phone numbers from property addresses
- Cost: $0.10-0.25 per record
- Build list -> skip trace -> direct mail -> call
- Full outbound machine

### Data Hooks Already Built

- Zone selection data structure in zones.json
- Property records with lat/lng, county, owner, mailing address
- CSV export endpoint: GET /api/leads/export/csv
- Data core with contact and property records
- LOB_API_KEY placeholder in .env

### Phase 2 Estimated Cost

- Lob.com: ~$0.75/postcard
- Skip trace: ~$0.15/record
- County auditor data: free (public records)
- Total per 500-home storm zone: ~$450 in postcards
- Expected response rate: 2-5% = 10-25 new leads
- Expected close rate on storm leads: 30-40%
- Revenue per close: $8,000-15,000 average
- ROI: $450 spend -> $24,000-150,000 revenue
