#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(dplyr)
  library(sf)
  library(glue)
  library(readr)
  library(tibble)
})

args <- commandArgs(trailingOnly = TRUE)

get_script_dir <- function() {
  cmd_args <- commandArgs(trailingOnly = FALSE)
  file_idx <- grep("^--file=", cmd_args)
  if (length(file_idx) > 0) {
    file_path <- sub("^--file=", "", cmd_args[file_idx[length(file_idx)]])
    return(dirname(normalizePath(file_path)))
  }
  if (!is.null(sys.frames()[[1]]$ofile)) {
    return(dirname(normalizePath(sys.frames()[[1]]$ofile)))
  }
  return(normalizePath("."))
}

script_dir <- get_script_dir()
default_addresses_path <- file.path(script_dir, "..", "..", "directories", "drive", "output", "derived", "directories", "munich_1885_addresses.RDS")
default_geo_path <- file.path(script_dir, "..", "..", "directories", "drive", "output", "derived", "directories", "munich_addresses_geo.RDS")
default_addresses_csv <- file.path(script_dir, "..", "data", "munich_geocoding_addresses.csv")

addresses_path <- if (length(args) >= 1) args[[1]] else default_addresses_path
geo_path <- if (length(args) >= 2) args[[2]] else default_geo_path
addresses_csv_path <- if (length(args) >= 3) args[[3]] else default_addresses_csv
joined_output_path <- if (length(args) >= 4) args[[4]] else NA_character_

stop_if_missing <- function(path, label) {
  if (!file.exists(path)) {
    stop(glue("{label} not found at '{path}'."))
  }
}

ensure_parent_dir <- function(path) {
  dir <- dirname(path)
  if (!dir.exists(dir)) {
    dir.create(dir, recursive = TRUE)
  }
}

format_house_number <- function(number, number_app, fallback) {
  base <- ifelse(is.na(number), NA_character_, ifelse(abs(number - round(number)) < 1e-9, as.character(as.integer(number)), as.character(number)))
  combined <- dplyr::case_when(
    !is.na(number_app) & number_app != "" ~ paste0(base, number_app),
    !is.na(base) ~ base,
    TRUE ~ NA_character_
  )

  out <- combined
  out[is.na(out) | out == "NA"] <- fallback[is.na(out) | out == "NA"]
  trimws(out)
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
    number_app = normalize_number_app(number_app),
    number_label = format_house_number(number, number_app, trimws(number_orig)),
    has_number = !is.na(number_label) & number_label != ""
  ) %>%
  filter(has_number) %>%
  mutate(number_label = gsub("\\s+", " ", number_label))

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
    dist_center
  )

joined <- addresses_clean %>%
  left_join(geo_selected, by = c("street", "number", "number_app")) %>%
  mutate(has_geo_match = !is.na(lon))

matched_count <- sum(joined$has_geo_match, na.rm = TRUE)
total_count <- nrow(joined)
pct_matched <- if (total_count > 0) round(100 * matched_count / total_count, 1) else NA_real_

message(glue("Matched {matched_count} of {total_count} addresses ({pct_matched}% with proxy coordinates)."))

# Prepare addresses CSV for app import
addresses_for_import <- joined %>%
  mutate(
    street = coalesce(street, street_orig)
  ) %>%
  distinct(street, number_label, .keep_all = TRUE) %>%
  arrange(street, number, number_label) %>%
  mutate(sort_index = row_number() - 1L) %>%
  select(
    street,
    number = number_label,
    street_orig,
    number_orig,
    address,
    has_geo_match,
    lon_proxy = lon,
    lat_proxy = lat,
    nbrh_name,
    dist_center,
    geo_source,
    geo_quality,
    sort_index
  )

ensure_parent_dir(addresses_csv_path)
write_csv(addresses_for_import, addresses_csv_path, na = "")
addresses_csv_path <- normalizePath(addresses_csv_path)
message(glue("Saved address import CSV to '{addresses_csv_path}'."))

if (!is.na(joined_output_path) && nzchar(joined_output_path)) {
  ensure_parent_dir(joined_output_path)
  saveRDS(joined, joined_output_path)
  joined_output_path <- normalizePath(joined_output_path)
  message(glue("Saved joined dataset to '{joined_output_path}'."))
}

# Preview unmatched streets for follow-up
top_unmatched <- joined %>%
  filter(!has_geo_match) %>%
  transmute(street, number = number_label) %>%
  slice_head(n = 10)

if (nrow(top_unmatched) > 0) {
  message("Sample unmatched addresses for manual review:")
  print(top_unmatched)
} else {
  message("All addresses have proxy coordinates.")
}
