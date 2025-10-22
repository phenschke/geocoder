#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(dplyr)
  library(sf)
  library(glue)
  library(tibble)
})

args <- commandArgs(trailingOnly = TRUE)

addresses_path <- if (length(args) >= 1) args[[1]] else "../directories/drive/output/derived/directories/munich_1865_addresses.RDS"
geo_path <- if (length(args) >= 2) args[[2]] else "../directories/drive/output/derived/directories/munich_addresses_geo.RDS"
output_path <- if (length(args) >= 3) args[[3]] else NA_character_

stop_if_missing <- function(path, label) {
  if (!file.exists(path)) {
    stop(glue("{label} not found at '{path}'."))
  }
}

stop_if_missing(addresses_path, "Address file")
stop_if_missing(geo_path, "Geo file")

addresses <- readRDS(addresses_path)
geo <- readRDS(geo_path)

normalize_number_app <- function(x) {
  x <- trimws(x)
  x[x == ""] <- NA_character_
  x
}

addresses_clean <- addresses %>%
  mutate(
    street = trimws(street),
    number = as.numeric(number),
    number_app = normalize_number_app(number_app)
  )

geo_selected <- geo %>%
  mutate(
    street = trimws(street),
    number = as.numeric(number),
    number_app = normalize_number_app(number_app)
  ) %>%
  select(
    street,
    number,
    number_app,
    lon,
    lat,
    geo_source,
    geo_quality,
    nbrh_id,
    nbrh_name,
    dist_center,
    geometry
  )

joined <- addresses_clean %>%
  left_join(geo_selected, by = c("street", "number", "number_app"))

match_counts <- summarise(
  joined,
  total = n(),
  matched = sum(!is.na(lon)),
  missing = total - matched,
  pct_matched = ifelse(total > 0, round(100 * matched / total, 1), NA_real_)
)

match_counts_list <- as.list(match_counts)

cat(glue(
  "Matched {match_counts_list$matched} of {match_counts_list$total} ",
  "addresses ({match_counts_list$pct_matched}% with coordinates).\n"
))

top_unmatched <- joined %>%
  filter(is.na(lon)) %>%
  transmute(address, street_orig, number_orig) %>%
  slice_head(n = 10)

if (nrow(top_unmatched) > 0) {
  cat("\nSample of unmatched addresses:\n")
  print(top_unmatched)
} else {
  cat("\nAll addresses matched to geo data.\n")
}

district_counts <- joined %>%
  filter(!is.na(lon)) %>%
  count(nbrh_name, sort = TRUE) %>%
  slice_head(n = 10)

if (nrow(district_counts) > 0) {
  cat("\nTop matched neighbourhoods:\n")
  print(district_counts)
}

if (!is.na(output_path) && nzchar(output_path)) {
  saveRDS(joined, output_path)
  cat(glue("\nSaved joined data to '{output_path}'.\n"))
}

