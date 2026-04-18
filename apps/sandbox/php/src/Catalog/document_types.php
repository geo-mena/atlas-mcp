<?php
declare(strict_types=1);

/**
 * document_types catalog — synthetic. Not real SENIAT codes.
 */
function document_types_catalog(): array
{
    return [
        ['code' => 'INV01', 'name' => 'Standard Invoice'],
        ['code' => 'INV02', 'name' => 'Credit Note'],
        ['code' => 'INV03', 'name' => 'Debit Note'],
        ['code' => 'INV04', 'name' => 'Export Invoice'],
    ];
}
