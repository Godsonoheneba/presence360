"use client";

import type { MouseEvent, ReactNode } from "react";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type Column<T> = {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
  className?: string;
};

export type RowAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  searchKeys?: Array<keyof T>;
  searchPlaceholder?: string;
  pageSize?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  rowActions?: (row: T) => RowAction[];
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
};

function matchesSearch<T>(row: T, keys: Array<keyof T>, searchTerm: string) {
  if (!searchTerm) return true;
  return keys.some((key) => {
    const value = row[key];
    if (value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(searchTerm.toLowerCase());
  });
}

export function DataTable<T>({
  columns,
  data,
  searchKeys,
  searchPlaceholder = "Search",
  pageSize = 10,
  page: externalPage,
  onPageChange,
  rowActions,
  emptyState,
  onRowClick,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [internalPage, setInternalPage] = useState(0);
  const page = externalPage ?? internalPage;
  const setPage = onPageChange ?? setInternalPage;

  const filtered = useMemo(() => {
    if (!searchKeys?.length) return data;
    return data.filter((row) => matchesSearch(row, searchKeys, searchTerm));
  }, [data, searchKeys, searchTerm]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="space-y-4">
      {searchKeys?.length ? (
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)} className={column.className}>
                {column.header}
              </TableHead>
            ))}
            {rowActions ? <TableHead className="w-12" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (rowActions ? 1 : 0)}>
                {emptyState ?? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No records found.
                  </div>
                )}
              </TableCell>
            </TableRow>
          ) : (
            paged.map((row, rowIndex) => (
              <TableRow
                key={`row-${rowIndex}`}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <TableCell key={`${rowIndex}-${String(column.key)}`} className={column.className}>
                    {column.render ? column.render(row[column.key], row) : String(row[column.key] ?? "-")}
                  </TableCell>
                ))}
                {rowActions ? (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={(event) => event.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {rowActions(row).map((action) =>
                          action.href ? (
                            <DropdownMenuItem key={action.label} disabled={action.disabled} asChild>
                              <Link href={action.href}>{action.label}</Link>
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              key={action.label}
                              disabled={action.disabled}
                              onClick={(event: MouseEvent<HTMLDivElement>) => {
                                event.stopPropagation();
                                action.onClick?.();
                              }}
                            >
                              {action.label}
                            </DropdownMenuItem>
                          ),
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Showing {paged.length} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
          >
            Previous
          </Button>
          <span className="min-w-[60px] text-center">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage + 1 >= pageCount}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
